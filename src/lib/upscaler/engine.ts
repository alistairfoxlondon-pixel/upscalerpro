/**
 * Upscaler Pro server engine.
 *
 * Two engines:
 *   standard  multi pass Lanczos resampling with a tuned unsharp mask chain.
 *   ai        Real-ESRGAN (realesr general x4 v3, SRVGGNetCompact, 1.25M
 *             params) via onnxruntime CPU. Tiles large inputs with square
 *             windows and feathered blending, then resizes to the requested
 *             output size. This genuinely reconstructs detail instead of
 *             just interpolating pixels.
 *
 * Formulas used (standard engine):
 *   Lanczos 3 resampling  a = 3 windowed sinc kernel
 *   Unsharp mask          out = in + amount * (in - gauss_sigma(in))
 *   libvips sharpen map   m1 flat areas, m2 jagged edges, x1 threshold,
 *                         y2 / y3 overshoot clamps (halo control)
 *   Progressive upscaling repeated <= 2x steps keep kernels small and avoid
 *   the ringing a single large step produces.
 *
 * Everything runs in memory. Nothing touches the disk, so user files are
 * gone the moment the response is sent.
 */
import path from 'node:path';
import sharp from 'sharp';

/* ----------------------------- limits ------------------------------ */

export const MAX_INPUT_PIXELS = 30_000_000;
export const MAX_INPUT_SIDE = 8192;
export const MAX_INPUT_BYTES = 26 * 1024 * 1024;
export const MAX_OUT_SIDE = 8192;
export const MAX_OUT_PIXELS = 34_000_000;

/** AI engine input budget. Keeps inference well inside serverless time. */
export const AI_INPUT_MAX_SIDE = 1280;
const AI_TILE = 384;
const AI_OVERLAP = 32;
const AI_WHOLE_MAX = 384; // single pass below this longest side

/* --------------------------- onnx session -------------------------- */

type OrtModule = typeof import('onnxruntime-node');
type OrtSession = import('onnxruntime-node').InferenceSession;

interface EngineState {
  ort?: OrtModule;
  session?: OrtSession;
  loading?: Promise<void>;
}

// survives hot reloads and is reused across requests on a warm instance
const g = globalThis as unknown as { __upscalerEngine?: EngineState };
const state: EngineState = (g.__upscalerEngine ??= {});

async function getSession(): Promise<OrtSession> {
  if (state.session) return state.session;
  if (!state.loading) {
    state.loading = (async () => {
      const ort = (await import('onnxruntime-node')) as unknown as OrtModule;
      state.ort = ort;
      const modelPath = path.join(process.cwd(), 'models', 'realesr-general-x4v3.onnx');
      state.session = await ort.InferenceSession.create(modelPath, {
        executionMode: 'sequential',
        graphOptimizationLevel: 'all',
      });
    })();
  }
  await state.loading;
  return state.session!;
}

/* ------------------------------ helpers ---------------------------- */

export interface UpscaleParams {
  engine: 'standard' | 'ai';
  /** exact output size, already capped and validated */
  outW: number;
  outH: number;
  inW: number;
  inH: number;
  denoise: 0 | 1 | 2;
  sharpen: boolean;
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
  keepExif: boolean;
  /** alpha handled separately (AI reconstructs RGB only) */
  hasAlpha: boolean;
}

export interface UpscaleOutcome {
  data: Buffer;
  width: number;
  height: number;
  format: string;
  aiTiles: number;
}

const SHARP_INIT = { failOn: 'none' as const, limitInputPixels: MAX_INPUT_PIXELS };

function stepsFor(factor: number): number[] {
  const steps: number[] = [];
  let remaining = factor;
  while (remaining > 2.0001) {
    steps.push(2);
    remaining /= 2;
  }
  if (remaining > 1.0001) steps.push(remaining);
  return steps.length ? steps : [1];
}

function cumulative(steps: number[], i: number): number {
  let k = 1;
  for (let s = 0; s <= i; s++) k *= steps[s];
  return k;
}

/* --------------------------- standard engine ------------------------ */

async function runStandard(input: Buffer, p: UpscaleParams): Promise<Buffer> {
  let img = sharp(input, SHARP_INIT).rotate();

  // gentle pre denoise. median is reserved for strong because it trades
  // fine texture for clean flat areas.
  if (p.denoise === 1) img = img.blur(0.4);
  if (p.denoise === 2) img = img.median(3);

  const factor = p.outW / Math.max(1, p.inW);
  const upscaling = factor > 1.02;

  if (upscaling && p.sharpen) {
    // pre sharpen the source so edges enter the resample with full energy
    img = img.sharpen({ sigma: 0.8, m1: 0, m2: 0.5 });
  }

  if (upscaling) {
    const steps = stepsFor(factor);
    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1;
      const stepW = isLast ? p.outW : Math.min(p.outW, Math.round(p.inW * cumulative(steps, i)));
      const stepH = isLast ? p.outH : Math.min(p.outH, Math.round(p.inH * cumulative(steps, i)));
      img = img.resize({ width: Math.max(1, stepW), height: Math.max(1, stepH), kernel: 'lanczos3', fit: 'fill' });
      if (!isLast && p.sharpen) {
        // light mid pass keeps steps crisp without halos
        img = img.sharpen({ sigma: 0.5, m1: 0, m2: 0.4 });
      }
      if (!isLast) {
        const buf = await img.toBuffer();
        img = sharp(buf, { limitInputPixels: MAX_OUT_PIXELS * 4 });
      }
    }
  } else {
    img = img.resize({ width: p.outW, height: p.outH, kernel: 'lanczos3', fit: 'fill' });
  }

  if (p.sharpen) {
    if (upscaling) {
      // final acutance pass, overshoot clamped to avoid halos
      img = img.sharpen({ sigma: 0.7, m1: 0, m2: 0.9, x1: 2, y2: 1.5, y3: 2.5 });
    } else {
      img = img.sharpen({ sigma: 0.6, m1: 0, m2: 0.5 });
    }
  }
  return encodeImg(img, p);
}

/* ------------------------------ ai engine --------------------------- */

/** Float32 CHW tensor from a raw RGB buffer. */
function toTensor(ort: OrtModule, rgb: Buffer, w: number, h: number) {
  const planes = w * h;
  const float = new Float32Array(planes * 3);
  for (let i = 0; i < planes; i++) {
    float[i] = rgb[i * 3] / 255;
    float[planes + i] = rgb[i * 3 + 1] / 255;
    float[2 * planes + i] = rgb[i * 3 + 2] / 255;
  }
  return new ort.Tensor('float32', float, [1, 3, h, w]);
}

function fromTensor(t: import('onnxruntime-node').Tensor): { rgb: Buffer; w: number; h: number } {
  const dims = t.dims as number[];
  const h = dims[2];
  const w = dims[3];
  const op = w * h;
  const d = t.data as Float32Array;
  const rgb = Buffer.alloc(op * 3);
  for (let i = 0; i < op; i++) {
    rgb[i * 3] = Math.max(0, Math.min(255, Math.round(d[i] * 255)));
    rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(d[op + i] * 255)));
    rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(d[2 * op + i] * 255)));
  }
  return { rgb, w, h };
}

async function inferRgb(session: OrtSession, ort: OrtModule, rgb: Buffer, w: number, h: number) {
  const out = await session.run({ [session.inputNames[0]]: toTensor(ort, rgb, w, h) });
  return fromTensor(out[session.outputNames[0]]);
}

/**
 * Square window tiling. Square windows with overlap plus weighted feather
 * blending keep memory low and seams invisible on any input size.
 */
async function inferTiled(
  session: OrtSession,
  ort: OrtModule,
  rgb: Buffer,
  w: number,
  h: number
): Promise<{ rgb: Buffer; w: number; h: number; tiles: number }> {
  const TILE = AI_TILE;
  const OV = AI_OVERLAP;
  const stride = TILE - OV;
  const lastX = Math.floor((w - 1) / stride) * stride;
  const lastY = Math.floor((h - 1) / stride) * stride;
  const padR = Math.max(0, lastX + TILE - w);
  const padB = Math.max(0, lastY + TILE - h);

  let src = rgb;
  let sw = w;
  let sh = h;
  if (padR || padB) {
    src = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
      .extend({ top: 0, left: 0, right: padR, bottom: padB, extendWith: 'copy' })
      .raw()
      .toBuffer();
    sw = w + padR;
    sh = h + padB;
  }

  const outW = w * 4;
  const outH = h * 4;
  const canvas = new Float32Array(outW * outH * 3);
  const weight = new Float32Array(outW * outH);
  const F = OV * 4;

  const xs: number[] = [];
  for (let x = 0; x <= lastX; x += stride) xs.push(x);
  const ys: number[] = [];
  for (let y = 0; y <= lastY; y += stride) ys.push(y);

  for (const y of ys) {
    for (const x of xs) {
      // gather the window
      const win = Buffer.alloc(TILE * TILE * 3);
      for (let py = 0; py < TILE; py++) {
        const srcOff = ((y + py) * sw + x) * 3;
        src.copy(win, py * TILE * 3, srcOff, srcOff + TILE * 3);
      }
      const res = await inferRgb(session, ort, win, TILE, TILE);
      // accumulate with feather weights
      const rw = res.w;
      const rh = res.h;
      for (let py = 0; py < rh; py++) {
        const oy = y * 4 + py;
        if (oy >= outH) continue;
        let aRow = 1;
        if (y > 0 && py < F) aRow = py / F;
        if (y < lastY && py >= rh - F) aRow = Math.min(aRow, (rh - 1 - py) / F);
        for (let px = 0; px < rw; px++) {
          const ox = x * 4 + px;
          if (ox >= outW) continue;
          let a = aRow;
          if (x > 0 && px < F) a = Math.min(a, px / F);
          if (x < lastX && px >= rw - F) a = Math.min(a, (rw - 1 - px) / F);
          const di = (oy * outW + ox) * 3;
          const si = (py * rw + px) * 3;
          canvas[di] += res.rgb[si] * a;
          canvas[di + 1] += res.rgb[si + 1] * a;
          canvas[di + 2] += res.rgb[si + 2] * a;
          weight[oy * outW + ox] += a;
        }
      }
    }
  }
  // normalize
  const norm = Buffer.alloc(outW * outH * 3);
  for (let i = 0; i < outW * outH; i++) {
    const k = weight[i];
    const di = i * 3;
    if (k > 0) {
      norm[di] = Math.round(canvas[di] / k);
      norm[di + 1] = Math.round(canvas[di + 1] / k);
      norm[di + 2] = Math.round(canvas[di + 2] / k);
    }
  }
  return { rgb: norm, w: outW, h: outH, tiles: xs.length * ys.length };
}

/* ------------------------------ encoding ---------------------------- */

async function encodeImg(img: sharp.Sharp, p: UpscaleParams): Promise<Buffer> {
  let out = img;
  if (p.format === 'jpeg') {
    out = out.flatten({ background: '#ffffff' }).jpeg({ quality: Math.round(p.quality * 100), mozjpeg: true });
    if (p.keepExif) {
      // orientation is baked into the pixels by rotate(), reset the tag so
      // viewers do not rotate a second time
      out = out.keepExif().withExifMerge({ IFD0: { Orientation: '1' } });
    }
  } else if (p.format === 'webp') {
    out = out.webp({ quality: Math.round(p.quality * 100), effort: 4 });
  } else {
    out = out.png({ compressionLevel: 9 });
  }
  return out.toBuffer();
}

/* ------------------------------- facade ----------------------------- */

export async function upscaleBuffer(input: Buffer, p: UpscaleParams): Promise<UpscaleOutcome> {
  if (p.engine !== 'ai') {
    const data = await runStandard(input, p);
    return { data, width: p.outW, height: p.outH, format: p.format, aiTiles: 0 };
  }

  const session = await getSession();
  const ort = state.ort!;
  const rgbBuf =
    p.denoise === 2
      ? // heavy artifacts only; the network handles the rest itself
        await sharp(input, SHARP_INIT).rotate().median(3).removeAlpha().raw().toBuffer()
      : await sharp(input, SHARP_INIT).rotate().removeAlpha().raw().toBuffer();

  let rgb: Buffer;
  let tiles = 0;
  let aw: number;
  let ah: number;
  if (Math.max(p.inW, p.inH) <= AI_WHOLE_MAX) {
    const r = await inferRgb(session, ort, rgbBuf, p.inW, p.inH);
    rgb = r.rgb;
    aw = r.w;
    ah = r.h;
    tiles = 1;
  } else {
    const r = await inferTiled(session, ort, rgbBuf, p.inW, p.inH);
    rgb = r.rgb;
    aw = r.w;
    ah = r.h;
    tiles = r.tiles;
  }

  let img = sharp(rgb, { raw: { width: aw, height: ah, channels: 3 } });
  if (Math.abs(aw - p.outW) > 1 || Math.abs(ah - p.outH) > 1) {
    img = img.resize({ width: p.outW, height: p.outH, kernel: 'lanczos3', fit: 'fill' });
  }
  if (p.sharpen) {
    // the model output is already crisp, only a whisper of acutance
    img = img.sharpen({ sigma: 0.4, m1: 0, m2: 0.35, x1: 2, y2: 1, y3: 1.5 });
  }

  if (p.hasAlpha) {
    const alphaBuf = await sharp(input, SHARP_INIT)
      .rotate()
      .extractChannel('alpha')
      .resize({ width: p.outW, height: p.outH, kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer();
    const rgbRaw = await img.raw().toBuffer();
    const px = p.outW * p.outH;
    const rgba = Buffer.alloc(px * 4);
    for (let i = 0; i < px; i++) {
      rgba[i * 4] = rgbRaw[i * 3];
      rgba[i * 4 + 1] = rgbRaw[i * 3 + 1];
      rgba[i * 4 + 2] = rgbRaw[i * 3 + 2];
      rgba[i * 4 + 3] = alphaBuf[i];
    }
    const data = await encodeImg(sharp(rgba, { raw: { width: p.outW, height: p.outH, channels: 4 } }), p);
    return { data, width: p.outW, height: p.outH, format: p.format, aiTiles: tiles };
  }

  const data = await encodeImg(img, p);
  return { data, width: p.outW, height: p.outH, format: p.format, aiTiles: tiles };
}
