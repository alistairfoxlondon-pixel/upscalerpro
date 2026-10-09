/// <reference lib="webworker" />
/**
 * PixelForge upscaling worker.
 * 100% on-device neural super-resolution: TensorFlow.js (WebGL) + UpscalerJS ESRGAN models.
 * All tensor I/O (no base64) so it runs safely inside a Web Worker.
 */
import * as tf from '@tensorflow/tfjs';
import Upscaler from 'upscaler';
import slim2 from '@upscalerjs/esrgan-slim/2x';
import slim3 from '@upscalerjs/esrgan-slim/3x';
import slim4 from '@upscalerjs/esrgan-slim/4x';
import medium2 from '@upscalerjs/esrgan-medium/2x';
import medium3 from '@upscalerjs/esrgan-medium/3x';
import medium4 from '@upscalerjs/esrgan-medium/4x';
import thick2 from '@upscalerjs/esrgan-thick/2x';
import thick3 from '@upscalerjs/esrgan-thick/3x';
import thick4 from '@upscalerjs/esrgan-thick/4x';
import type { ModelDefinition, PresetId, ScaleFactor, WorkerInMessage } from '@/lib/upscaler/types';

const PATCH_SIZE = 128;
const PADDING = 8;

 
let ORIGIN = '';
function resolvePath(path: string): string {
  if (path.startsWith('/') && ORIGIN) return `${ORIGIN}${path}`;
  return path;
}

function withLocalPath(def: unknown, path: string): ModelDefinition {
  return { ...(def as ModelDefinition), path: resolvePath(path) };
}

/**
 * Slim & Medium weights are self-hosted from /public/models (privacy: zero
 * third-party requests). The optional Studio weights (~29 MB) load from the
 * jsDelivr/unpkg CDN on demand.
 */
const REGISTRY: Record<string, ModelDefinition> = {
  'fast:2': withLocalPath(slim2, '/models/esrgan-slim/x2/model.json'),
  'fast:3': withLocalPath(slim3, '/models/esrgan-slim/x3/model.json'),
  'fast:4': withLocalPath(slim4, '/models/esrgan-slim/x4/model.json'),
  'balanced:2': withLocalPath(medium2, '/models/esrgan-medium/x2/model.json'),
  'balanced:3': withLocalPath(medium3, '/models/esrgan-medium/x3/model.json'),
  'balanced:4': withLocalPath(medium4, '/models/esrgan-medium/x4/model.json'),
  'studio:2': thick2 as ModelDefinition,
  'studio:3': thick3 as ModelDefinition,
  'studio:4': thick4 as ModelDefinition,
};

const ctx: {
  postMessage: (m: unknown, transfer?: Transferable[]) => void;
  addEventListener: (t: 'message', cb: (e: MessageEvent<WorkerInMessage>) => void) => void;
} = self as any;

function post(m: unknown, transfer?: Transferable[]) {
  ctx.postMessage(m, transfer);
}

let backendReady: Promise<string> | null = null;
let forcedBackend: 'webgl' | 'cpu' | null = null;

function initBackend(hint?: 'webgl' | 'cpu'): Promise<string> {
  if (hint && forcedBackend !== hint) {
    // a stall watchdog retry can demand a different backend mid-session
    forcedBackend = hint;
    backendReady = null;
    modelCache.clear();
  }
  if (!backendReady) {
    backendReady = (async () => {
      if (forcedBackend === 'cpu') {
        // watchdog CPU retry — pure-JS backend, slower but rock solid
        await tf.setBackend('cpu');
        await tf.ready();
      } else {
        let backend = 'cpu';
        try {
          const ok = await tf.setBackend('webgl');
          await tf.ready();
          if (ok && tf.getBackend() === 'webgl') backend = 'webgl';
          else await tf.setBackend('cpu');
        } catch {
          await tf.setBackend('cpu');
        }
        await tf.ready();
      }
      post({ type: 'backend', backend: tf.getBackend() });
      return tf.getBackend();
    })();
  }
  return backendReady;
}
initBackend();

/* ---------------- model cache ---------------- */

type UpscalerInstance = {
  ready: Promise<void>;
  execute: (
    input: tf.Tensor4D,
    options: Record<string, unknown>
  ) => Promise<tf.Tensor3D>;
  dispose: () => Promise<void>;
};

const modelCache = new Map<string, UpscalerInstance>();

async function getModel(backend: string, preset: PresetId, scale: ScaleFactor): Promise<UpscalerInstance> {
  const cacheKey = `${backend}:${preset}:${scale}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;
  const def = REGISTRY[`${preset}:${scale}`];
  if (!def) throw new Error(`Unknown model configuration ${preset}:${scale}`);
  post({ type: 'model-status', preset, scale, status: 'loading' });
  try {
     
    const upscaler = new (Upscaler as any)({
      model: def,
      warmupSizes: { patchSize: PATCH_SIZE, padding: PADDING },
    }) as UpscalerInstance;
    const t0 = performance.now();
    await upscaler.ready;
    console.log(`[worker] model ${cacheKey} ready in ${Math.round(performance.now() - t0)}ms`);
    modelCache.set(cacheKey, upscaler);
    post({ type: 'model-status', preset, scale, status: 'ready' });
    return upscaler;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load AI model';
    post({ type: 'model-status', preset, scale, status: 'error', message });
    throw err;
  }
}

/* ---------------- cancellation ---------------- */

const aborts = new Map<string, AbortController>();

/* ---------------- helpers ---------------- */

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message)))
  );
}

let lastProgressAt = 0;
function postProgress(id: string, rate: number) {
  const now = performance.now();
  if (rate >= 1 || now - lastProgressAt > 80) {
    lastProgressAt = now;
    post({ type: 'progress', id, rate: Math.min(0.999, Math.max(0, rate)) });
  }
}

function postPhase(id: string, phase: string) {
  post({ type: 'phase', id, phase });
}

/* ---------------- pixel enhancement passes ---------------- */

/**
 * 3×3 median filter — removes salt/pepper noise and JPEG/pixel artifacts
 * before super-resolution. Alpha channel is passed through untouched.
 */
function medianFilter3(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length);
  const win = new Uint8Array(9);
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y2 = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x2 = x < w - 1 ? x + 1 : w - 1;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        win[0] = px[(y0 * w + x0) * 4 + c];
        win[1] = px[(y0 * w + x) * 4 + c];
        win[2] = px[(y0 * w + x2) * 4 + c];
        win[3] = px[(y * w + x0) * 4 + c];
        win[4] = px[i + c];
        win[5] = px[(y * w + x2) * 4 + c];
        win[6] = px[(y2 * w + x0) * 4 + c];
        win[7] = px[(y2 * w + x) * 4 + c];
        win[8] = px[(y2 * w + x2) * 4 + c];
        for (let a = 1; a < 9; a++) {
          const v = win[a];
          let b = a - 1;
          while (b >= 0 && win[b] > v) {
            win[b + 1] = win[b];
            b--;
          }
          win[b + 1] = v;
        }
        out[i + c] = win[4];
      }
      out[i + 3] = px[i + 3];
    }
  }
  return out;
}

/**
 * Unsharp mask (3×3 gaussian, separable) — crisps fine detail after the
 * neural upscale without halos on flat areas (thresholded).
 */
function unsharpMask(rgba: Uint8ClampedArray, w: number, h: number, amount = 0.6, threshold = 2) {
  const blur = new Float32Array(rgba.length);
  // horizontal [1 2 1]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < w - 1 ? x + 1 : w - 1;
      const i = (y * w + x) * 4;
      const im = (y * w + xm) * 4;
      const ip = (y * w + xp) * 4;
      blur[i] = (rgba[im] + 2 * rgba[i] + rgba[ip]) / 4;
      blur[i + 1] = (rgba[im + 1] + 2 * rgba[i + 1] + rgba[ip + 1]) / 4;
      blur[i + 2] = (rgba[im + 2] + 2 * rgba[i + 2] + rgba[ip + 2]) / 4;
    }
  }
  // vertical [1 2 1] + blend, in place on rgba
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const im = (ym * w + x) * 4;
      const ip = (yp * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const b = (blur[im + c] + 2 * blur[i + c] + blur[ip + c]) / 4;
        const diff = rgba[i + c] - b;
        if (diff > threshold || diff < -threshold) {
          const v = rgba[i + c] + amount * diff;
          rgba[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
  }
}

async function upscaleRgbTensor(
  upscaler: UpscalerInstance,
  input: tf.Tensor4D,
  id: string,
  signal: AbortSignal,
  mapRate?: (rate: number) => number
): Promise<tf.Tensor3D> {
  return (await upscaler.execute(input, {
    output: 'tensor' as const,
    progressOutput: 'tensor' as const,
    patchSize: PATCH_SIZE,
    padding: PADDING,
    signal,
    // yield to the event loop between patches — keeps the GPU command queue
    // shallow (prevents readback deadlocks on software renderers) and lets
    // cancellation + progress messages flow
    awaitNextFrame: true,
    progress: (amount: number, slice: unknown) => {
      // dispose intermediate patch tensors (required when progressOutput is 'tensor')
      if (slice && typeof (slice as tf.Tensor).dispose === 'function') {
        (slice as tf.Tensor).dispose();
      }
      postProgress(id, mapRate ? mapRate(amount) : amount);
    },
  })) as tf.Tensor3D;
}

function dbg(text: string) {
  console.log(`[pf] ${text}`);
  post({ type: 'debug', text });
}

async function handleUpscale(msg: Extract<WorkerInMessage, { type: 'upscale' }>) {
  const { id, bitmap, scale, preset, format, quality, denoise, sharpen } = msg;
  const t0 = performance.now();
  dbg(`job ${id.slice(0, 6)} start ${bitmap.width}x${bitmap.height} ${preset}:${scale}`);
  const ac = new AbortController();
  aborts.set(id, ac);
  let out: tf.Tensor3D | null = null;
  try {
    await initBackend(msg.backendHint);
    const backend = tf.getBackend();

    const w = bitmap.width;
    const h = bitmap.height;
    if (Math.max(w, h) > 8192) {
      throw new Error('Image is too large to process in the browser (max 8192 px per side)');
    }

    // Bitmap → ImageData
    const src = new OffscreenCanvas(w, h);
    const srcCtx = src.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) throw new Error('OffscreenCanvas unavailable');
    srcCtx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = srcCtx.getImageData(0, 0, w, h);

    // Optional pre-pass: median denoise (cheap artifact/noise cleanup)
    if (denoise > 0) {
      postPhase(id, 'Cleaning noise');
      const tD = performance.now();
      imageData.data.set(medianFilter3(imageData.data, w, h));
      if (denoise > 1) {
        imageData.data.set(medianFilter3(imageData.data, w, h));
      }
      dbg(`job ${id.slice(0, 6)} denoise x${denoise} ${Math.round(performance.now() - tD)}ms`);
    }

    // Alpha detection + RGBA → RGB float tensor
    const px = imageData.data;
    let hasAlpha = false;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] !== 255) {
        hasAlpha = true;
        break;
      }
    }
    const n = w * h;
    const rgb = new Float32Array(n * 3);
    for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
      rgb[j] = px[i];
      rgb[j + 1] = px[i + 1];
      rgb[j + 2] = px[i + 2];
    }
    // 8× runs as a chained 4×→2× pass (reuses self-hosted weights — no extra
    // downloads, and quality stays on the same ESRGAN architecture). Every
    // intermediate tensor is tracked and disposed in the finally block.
    const passes: ScaleFactor[] = scale === 8 ? [4, 2] : [scale];
    const tracked: Array<{ dispose(): void }> = [];
    let input: tf.Tensor4D = tf.tensor4d(rgb, [1, h, w, 3]);
    tracked.push(input);
    try {
      for (let p = 0; p < passes.length; p++) {
        const passScale = passes[p];
        const isLast = p === passes.length - 1;
        const passUpscaler = await getModel(backend, preset, passScale);
        if (aborts.get(id) !== ac) throw new Error('Canceled');
        if (p === 0) {
          // always announce readiness so the UI can leave the "Loading model"
          // phase even when the model was cached
          post({ type: 'model-status', preset, scale, status: 'ready' });
        }
        const tPass = performance.now();
        const res = await upscaleRgbTensor(
          passUpscaler,
          input,
          id,
          ac.signal,
          // pass 1 (4×) ≈ 22% of the work, pass 2 (2×) ≈ 78% (pixel counts)
          passes.length === 1 ? undefined : p === 0 ? (r) => r * 0.22 : (r) => 0.22 + r * 0.77
        );
        dbg(
          `job ${id.slice(0, 6)} pass ${passScale}x done ${Math.round(performance.now() - tPass)}ms` +
            ` -> ${res.shape[1]}x${res.shape[0]}`
        );
        if (!isLast) {
          tracked.push(res);
          const prev = input;
          input = tf.reshape(res, [
            1,
            res.shape[0] as number,
            res.shape[1] as number,
            3,
          ]) as tf.Tensor4D;
          tracked.push(input);
          prev.dispose(); // shares memory with the reshaped view (refcounted)
        } else {
          out = res; // final output — disposed below after data readback
        }
      }
    } finally {
      for (const t of tracked) t.dispose();
    }
    if (aborts.get(id) !== ac) throw new Error('Canceled');
    if (!out) throw new Error('Upscaling produced no output');

    const h2 = out.shape[0] as number;
    const w2 = out.shape[1] as number;
    postProgress(id, 1);
    // Read the GPU tensor back in horizontal strips: one giant readPixels can
    // wedge slow/software GPUs with zero feedback (and starve the stall
    // watchdog) — strips keep messages flowing and tick a Finalizing %.
    const strips = Math.min(8, Math.max(1, Math.floor(h2 / 256)));
    const rgbOut = new Float32Array(w2 * h2 * 3);
    for (let s = 0; s < strips; s++) {
      const y0 = Math.floor((h2 * s) / strips);
      const y1 = Math.floor((h2 * (s + 1)) / strips);
      const slice = out.slice([y0, 0, 0], [y1 - y0, w2, 3]);
      const data = await slice.data();
      rgbOut.set(data as Float32Array, y0 * w2 * 3);
      slice.dispose();
      if (strips > 1) {
        postPhase(id, `Finalizing ${Math.round(((s + 1) / strips) * 100)}%`);
      }
    }
    out.dispose();
    out = null;
    dbg(`job ${id.slice(0, 6)}` + ` data read ${Math.round(performance.now() - t0)}ms`);

    // Tensor → RGBA pixels
    const rgba = new Uint8ClampedArray(w2 * h2 * 4);
    for (let i = 0, j = 0, k = 0; k < w2 * h2; k++, i += 3, j += 4) {
      const r = rgbOut[i];
      const g = rgbOut[i + 1];
      const b = rgbOut[i + 2];
      rgba[j] = r < 0 ? 0 : r > 255 ? 255 : r;
      rgba[j + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgba[j + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      rgba[j + 3] = 255;
    }

    // Restore transparency by bilinearly scaling the original alpha channel.
    if (hasAlpha) {
      const aSrc = new OffscreenCanvas(w, h);
      const aCtx = aSrc.getContext('2d');
      if (aCtx) {
        const gray = new Uint8ClampedArray(w * h * 4);
        for (let i = 0, j = 0; i < px.length; i += 4, j += 4) {
          const a = px[i + 3];
          gray[j] = a;
          gray[j + 1] = a;
          gray[j + 2] = a;
          gray[j + 3] = 255;
        }
        aCtx.putImageData(new ImageData(gray, w, h), 0, 0);
        const aDst = new OffscreenCanvas(w2, h2);
        const adCtx = aDst.getContext('2d');
        if (adCtx) {
          adCtx.imageSmoothingEnabled = true;
          adCtx.imageSmoothingQuality = 'high';
          adCtx.drawImage(aSrc, 0, 0, w2, h2);
          const scaled = adCtx.getImageData(0, 0, w2, h2);
          for (let k = 0, j = 3; k < w2 * h2; k++, j += 4) {
            rgba[j] = scaled.data[k * 4];
          }
        }
      }
    }

    // Optional post-pass: unsharp mask for extra perceived detail
    if (sharpen) {
      postPhase(id, 'Sharpening');
      const tS = performance.now();
      unsharpMask(rgba, w2, h2);
      dbg(`job ${id.slice(0, 6)} sharpen ${Math.round(performance.now() - tS)}ms`);
    }

    const outCanvas = new OffscreenCanvas(w2, h2);
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new Error('OffscreenCanvas unavailable');
    outCtx.putImageData(new ImageData(rgba, w2, h2), 0, 0);

    let encodeCanvas: OffscreenCanvas = outCanvas;
    if (format === 'jpeg' && hasAlpha) {
      // JPEG has no alpha — flatten over white instead of black.
      const flat = new OffscreenCanvas(w2, h2);
      const fCtx = flat.getContext('2d');
      if (fCtx) {
        fCtx.fillStyle = '#ffffff';
        fCtx.fillRect(0, 0, w2, h2);
        fCtx.drawImage(outCanvas, 0, 0);
        encodeCanvas = flat;
      }
    }

    const mime = `image/${format}`;
    const blob = await encodeCanvas.convertToBlob({
      type: mime,
      quality: format === 'png' ? undefined : quality,
    });
    dbg(`job ${id.slice(0, 6)} encoded ${blob.size}B total ${Math.round(performance.now() - t0)}ms`);
    post(
      {
        type: 'done',
        id,
        blob,
        width: w2,
        height: h2,
        ms: performance.now() - t0,
      }
    );
  } catch (err) {
    const canceled = isAbortError(err) || (err instanceof Error && /^canceled$/i.test(err.message));
    post({
      type: 'error',
      id,
      message: canceled ? 'Canceled' : err instanceof Error ? err.message : 'Upscaling failed',
    });
  } finally {
    aborts.delete(id);
    if (out) out.dispose();
  }
}

/* ---------------- serialized task queue ---------------- */

let chain: Promise<void> = Promise.resolve();

ctx.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'init') {
    // Bundlers may run this worker from a blob: URL — absolutize model paths
    ORIGIN = msg.origin || '';
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (key.startsWith('fast:') || key.startsWith('balanced:')) {
        const rel = def.path?.replace(/^https?:\/\/[^/]+/, '');
        if (rel && rel.startsWith('/')) REGISTRY[key] = { ...def, path: resolvePath(rel) };
      }
    }
    return;
  }
  if (msg.type === 'cancel') {
    const ac = aborts.get(msg.id);
    if (ac) ac.abort();
    return;
  }
  if (msg.type === 'upscale') {
    chain = chain
      .then(() => handleUpscale(msg))
      .catch((err) => {
        console.error('[pixelforge-worker]', err);
      });
  }
});
