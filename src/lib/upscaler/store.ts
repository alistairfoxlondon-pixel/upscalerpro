'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeImageFile } from './decode';
import {
  MAX_BATCH_FILES,
  MAX_INPUT_PIXELS,
  MAX_UPLOAD_BYTES,
  extForFormat,
  planOutput,
  resolveFormat,
} from './registry';
import {
  idbClearResults,
  idbDeleteResult,
  idbLoadResults,
  idbPutResult,
  type PersistedResult,
} from './persist';
import type {
  EngineChoice,
  OutputFormat,
  QueueItem,
  ResultData,
  ScaleFactor,
  Settings,
} from './types';
import { formatBytes } from './utils';
import type { SampleKind } from './utils';
import { makePreviewUrl, makeThumbUrl } from './utils';
import {
  buildStockCsv,
  makeAnalyzeProxy,
  measurePixels,
  slugify,
  STOCK_README,
  toJpegBlob,
  type StockMeta,
} from './stock';

export type { QueueItem } from './types';

export const DEFAULT_SETTINGS: Settings = {
  engine: 'standard',
  scale: 2,
  scaleMode: 'factor',
  targetSide: 1920,
  format: 'auto',
  jpegQuality: 0.92,
  denoise: 0,
  sharpen: true,
  keepExif: false,
  queueView: 'list',
  compareMode: 'slider',
  compareZoom: 1,
};

export interface Totals {
  images: number;
  pixelsIn: number;
  pixelsOut: number;
  ms: number;
  bytesIn: number;
  bytesOut: number;
}

const initialTotals: Totals = { images: 0, pixelsIn: 0, pixelsOut: 0, ms: 0, bytesIn: 0, bytesOut: 0 };

interface UpscalerState {
  items: QueueItem[];
  settings: Settings;
  busy: boolean;
  paused: boolean;
  activeId: string | null;
  totals: Totals;
  compareId: string | null;

  addFiles: (files: File[]) => Promise<void>;
  addSample: (kind?: SampleKind) => Promise<void>;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  clearAll: () => void;
  retry: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  togglePause: () => void;
  setCompare: (id: string | null) => void;
  toggleZip: (id: string) => void;
  /** generate Adobe Stock metadata for one item (AI) */
  generateMetadata: (id: string) => Promise<void>;
  /** update metadata fields by hand */
  updateMeta: (id: string, patch: Partial<StockMeta>) => void;
  /** reload finished results persisted by a previous session */
  restorePersisted: () => Promise<number>;
}

/* ------------------------------------------------------------------ */

function patchItem(id: string, patch: Partial<QueueItem>) {
  useStore.setState((s) => ({
    items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
  }));
}

/** In-flight requests, so removing an item cancels its upload. */
const activeXhrs = new Map<string, XMLHttpRequest>();

function cancelActive(id: string) {
  const xhr = activeXhrs.get(id);
  if (xhr) {
    try {
      xhr.abort();
    } catch {
      /* ignore */
    }
    activeXhrs.delete(id);
  }
}

interface ServerResult {
  blob: Blob;
  width: number;
  height: number;
  ms: number;
  applied: {
    engine: EngineChoice;
    scale: number;
    format: string;
    tiles: number;
    capped: boolean;
    aiFallback: boolean;
  };
}

/** Upload one file to /api/upscale with live progress. */
function processViaServer(
  id: string,
  upload: Blob,
  params: Record<string, string>,
  onProgress: (progress: number, phase: string, speed?: string) => void
): Promise<ServerResult> {
  return new Promise<ServerResult>((resolve, reject) => {
    const form = new FormData();
    form.append('file', upload, 'input');
    for (const [k, v] of Object.entries(params)) form.append(k, v);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upscale');
    xhr.responseType = 'blob';
    activeXhrs.set(id, xhr);

    let creep: ReturnType<typeof setInterval> | null = null;
    const stopCreep = () => {
      if (creep) {
        clearInterval(creep);
        creep = null;
      }
    };

    // rolling transfer-rate hint, sampled at most ~3x per second
    let lastT = 0;
    let lastLoaded = 0;
    let lastSpeed = '';
    const rate = (loaded: number): string => {
      const now = performance.now();
      if (!lastT) {
        lastT = now;
        lastLoaded = loaded;
        return lastSpeed;
      }
      const dt = now - lastT;
      if (dt >= 300) {
        const bps = ((loaded - lastLoaded) * 1000) / dt;
        lastT = now;
        lastLoaded = loaded;
        if (bps > 0) lastSpeed = `${formatBytes(bps)}/s`;
      }
      return lastSpeed;
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(0.02 + 0.26 * (e.loaded / Math.max(1, e.total)), 'Uploading', rate(e.loaded));
      }
    };
    xhr.upload.onload = () => {
      onProgress(0.3, 'Processing');
      // gentle indeterminate creep while the server works
      creep = setInterval(() => {
        const it = useStore.getState().items.find((i) => i.id === id);
        if (!it || it.status !== 'processing') return;
        onProgress(Math.min(0.72, it.progress + 0.012), 'Processing');
      }, 500);
    };
    xhr.onprogress = (e) => {
      stopCreep();
      if (e.lengthComputable && e.total > 0) {
        onProgress(0.74 + 0.24 * (e.loaded / e.total), 'Downloading', rate(e.loaded));
      }
    };
    xhr.onload = () => {
      stopCreep();
      activeXhrs.delete(id);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
        const width = Number(xhr.getResponseHeader('X-Image-Width')) || 0;
        const height = Number(xhr.getResponseHeader('X-Image-Height')) || 0;
        const ms = Number(xhr.getResponseHeader('X-Process-Ms')) || 0;
        const applied = {
          engine: (xhr.getResponseHeader('X-Applied-Engine') === 'ai'
            ? 'ai'
            : xhr.getResponseHeader('X-Applied-Engine') === 'glm'
              ? 'glm'
              : 'standard') as EngineChoice,
          scale: Number(xhr.getResponseHeader('X-Applied-Scale')) || 0,
          format: xhr.getResponseHeader('X-Applied-Format') || '',
          tiles: Number(xhr.getResponseHeader('X-Ai-Tiles')) || 0,
          capped: xhr.getResponseHeader('X-Capped') === '1',
          aiFallback: xhr.getResponseHeader('X-Ai-Fallback') === '1',
        };
        resolve({ blob: xhr.response as Blob, width, height, ms, applied });
      } else {
        const fail = (msg: string) => reject(new Error(msg));
        const body = xhr.response;
        if (body instanceof Blob && typeof body.text === 'function') {
          body
            .text()
            .then((t) => {
              try {
                const j = JSON.parse(t) as { error?: string };
                fail(j.error || `Processing failed (${xhr.status})`);
              } catch {
                fail(`Processing failed (${xhr.status})`);
              }
            })
            .catch(() => fail(`Processing failed (${xhr.status})`));
        } else {
          fail(`Processing failed (${xhr.status})`);
        }
      }
    };
    xhr.onerror = () => {
      stopCreep();
      activeXhrs.delete(id);
      reject(new Error('Network error while uploading'));
    };
    xhr.onabort = () => {
      stopCreep();
      activeXhrs.delete(id);
      reject(new Error('Canceled'));
    };
    xhr.send(form);
  });
}

/**
 * Vercel accepts about 4.5 MB per request. Oversized inputs are re-encoded
 * client side (stepped down until they fit) so every deploy stays usable.
 */
async function fitUpload(file: File): Promise<Blob> {
  const { bitmap } = await decodeImageFile(file);
  try {
    for (const maxSide of [3072, 2048, 1536, 1024, 768]) {
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * ratio));
      const h = Math.max(1, Math.round(bitmap.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const [type, q] of [
        ['image/webp', 0.92],
        ['image/jpeg', 0.9],
      ] as const) {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
        if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      }
    }
    throw new Error('Image is too large to upload even after compression');
  } finally {
    bitmap.close();
  }
}

async function processItem(id: string): Promise<void> {
  const state = useStore.getState();
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  if (!item.file) {
    patchItem(id, {
      status: 'error',
      phase: 'Failed',
      error: 'Original file is not kept after a reload. Add the image again.',
      result: undefined,
    });
    return;
  }
  if (!item.w || !item.h) {
    patchItem(id, {
      status: 'error',
      phase: 'Failed',
      error: 'Could not read the image dimensions',
      result: undefined,
    });
    return;
  }
  const settings = useStore.getState().settings;
  const resolved: OutputFormat =
    settings.format === 'auto' ? resolveFormat(item.mime, item.name) : settings.format;

  const fit = planOutput(item.w, item.h, settings);
  if (!fit || fit.error) {
    patchItem(id, {
      status: 'error',
      phase: 'Failed',
      error: fit?.error ?? 'Image is too large to upscale',
      result: undefined,
    });
    return;
  }

  patchItem(id, {
    status: 'processing',
    progress: 0.02,
    phase: 'Uploading',
    error: undefined,
  });
  useStore.setState({ activeId: id });

  const planned: ResultData = {
    url: '',
    size: 0,
    w: fit.outW,
    h: fit.outH,
    ms: 0,
    scale: fit.scale,
    format: resolved,
    clamped: fit.clamped ?? false,
    engine: fit.aiFallback ? 'standard' : settings.engine,
    tiles: 0,
    capped: fit.clamped ?? false,
    aiFallback: fit.aiFallback ?? false,
    target:
      settings.scaleMode === 'target' && !fit.short && !fit.error ? settings.targetSide : undefined,
  };
  patchItem(id, { result: planned });

  const buildParams = (): Record<string, string> => ({
    engine: fit.aiFallback ? 'standard' : settings.engine,
    scale: String(fit.scale),
    target: planned.target ? String(planned.target) : '',
    denoise: String(settings.denoise),
    sharpen: settings.sharpen ? '1' : '0',
    format: resolved,
    quality: String(settings.jpegQuality),
    exif: settings.keepExif && resolved === 'jpeg' ? '1' : '0',
  });

  try {
    let upload: Blob = item.file;
    if (item.file.size > MAX_UPLOAD_BYTES) {
      patchItem(id, { phase: 'Optimizing' });
      upload = await fitUpload(item.file);
      patchItem(id, { optimized: true });
      const { toast } = await import('sonner');
      toast.info('Large image optimized before upload', {
        description: `${formatBytes(item.sizeIn)} in, ${formatBytes(upload.size)} sent.`,
      });
    }

    let res: ServerResult;
    try {
      res = await processViaServer(id, upload, buildParams(), (progress, phase, speed) =>
        patchItem(id, {
          progress,
          phase,
          // keep the hint only while a transfer is actually running
          speed: phase === 'Uploading' || phase === 'Downloading' ? speed : undefined,
        })
      );
    } catch (err) {
      // a 413 from the platform body limit: re-encode once and retry so the
      // user never sees a raw upload error
      const msg = err instanceof Error ? err.message : '';
      if (/(413|too large|payload)/i.test(msg) && !item.optimized) {
        patchItem(id, { phase: 'Optimizing' });
        upload = await fitUpload(item.file);
        patchItem(id, { optimized: true });
        res = await processViaServer(id, upload, buildParams(), (progress, phase, speed) =>
          patchItem(id, {
            progress,
            phase,
            speed: phase === 'Uploading' || phase === 'Downloading' ? speed : undefined,
          })
        );
      } else {
        throw err;
      }
    }

    const url = URL.createObjectURL(res.blob);
    const result: ResultData = {
      url,
      size: res.blob.size,
      w: res.width || fit.outW,
      h: res.height || fit.outH,
      ms: res.ms,
      scale: (res.applied.scale || fit.scale) as ScaleFactor,
      format: res.blob.type.includes('jpeg')
        ? 'jpeg'
        : res.blob.type.includes('webp')
          ? 'webp'
          : 'png',
      clamped: res.applied.capped || (fit.clamped ?? false),
      engine: res.applied.engine,
      tiles: res.applied.tiles,
      capped: res.applied.capped,
      aiFallback: res.applied.aiFallback,
      target: planned.target,
    };
    patchItem(id, { status: 'done', progress: 1, phase: 'Done', result });
    useStore.setState((s) => ({
      totals: {
        images: s.totals.images + 1,
        pixelsIn: s.totals.pixelsIn + item.w * item.h,
        pixelsOut: s.totals.pixelsOut + result.w * result.h,
        ms: s.totals.ms + result.ms,
        bytesIn: s.totals.bytesIn + item.sizeIn,
        bytesOut: s.totals.bytesOut + result.size,
      },
    }));
    void savePersisted(item, res.blob, result);
    // quality measurements + AI metadata run in the background, the queue
    // never waits for them
    void measurePixels(url)
      .then((stats) => patchItem(id, { stats }))
      .catch(() => undefined);
    void useStore.getState().generateMetadata(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Processing failed';
    const canceled = /^canceled$/i.test(msg);
    patchItem(id, {
      status: canceled ? 'canceled' : 'error',
      phase: canceled ? 'Canceled' : 'Failed',
      error: canceled ? undefined : msg,
      progress: 0,
      speed: undefined,
      result: undefined, // drop the planned placeholder so the meta line stays honest
    });
    if (!canceled) {
      console.error('[pixelforge]', msg);
      void import('sonner').then(({ toast }) =>
        toast.error('Upscaling failed', { description: msg })
      );
    }
  }
}

/**
 * Persist a finished result to IndexedDB so it can be restored after a
 * reload. Never throws.
 */
async function savePersisted(item: QueueItem, blob: Blob, result: ResultData) {
  try {
    const [thumbBlob, originalBlob] = await Promise.all([
      fetch(item.thumbUrl)
        .then((r) => r.blob())
        .catch(() => null),
      item.originalUrl
        ? makePreviewUrlFromUrl(item.originalUrl).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (!thumbBlob || !originalBlob) return;
    const data: PersistedResult = {
      w: item.w,
      h: item.h,
      sizeIn: item.sizeIn,
      name: item.name,
      mime: item.mime,
      thumb: thumbBlob,
      original: originalBlob,
      result: {
        blob,
        w: result.w,
        h: result.h,
        ms: result.ms,
        scale: result.scale,
        format: result.format,
        clamped: result.clamped,
        target: result.target,
        engine: result.engine,
        tiles: result.tiles,
      },
      savedAt: Date.now(),
    };
    await idbPutResult(item.id, data);
  } catch {
    /* best-effort */
  }
}

/** Re-encodes any image object-URL to a ≤2048px JPEG for compact storage. */
async function makePreviewUrlFromUrl(url: string, maxSide = 2048): Promise<Blob> {
  const src = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const ratio = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * ratio));
    const h = Math.max(1, Math.round(src.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) throw new Error('Preview encoding failed');
    return blob;
  } finally {
    src.close();
  }
}

const CONCURRENCY = 2;

async function ensureLoop() {
  if (loopRunning) return;
  loopRunning = true;
  useStore.setState({ busy: true });
  let completed = 0;
  try {
    for (;;) {
      const s = useStore.getState();
      if (s.paused) break;
      // process up to CONCURRENCY items at once: sharp handles parallel
      // requests comfortably, so batches finish noticeably faster
      const batch = s.items.filter((i) => i.status === 'queued').slice(0, CONCURRENCY);
      if (!batch.length) break;
      useStore.setState({ activeId: batch[0].id });
      await Promise.all(
        batch.map(async (item) => {
          await processItem(item.id);
          const after = useStore.getState().items.find((i) => i.id === item.id);
          if (after?.status === 'done') completed++;
        })
      );
    }
  } finally {
    loopRunning = false;
    useStore.setState({ busy: false, activeId: null });
    if (completed > 0 && !useStore.getState().paused) {
      const { toast } = await import('sonner');
      toast.success(
        completed === 1 ? '1 image ready' : `${completed} images ready`,
        {
          description: 'Processed on the server. Download or export a ZIP.',
          action: { label: 'Download ZIP', onClick: () => void downloadAllAsZip() },
          duration: 10_000,
        }
      );
    }
  }
}

let loopRunning = false;

/* --------------------- AI metadata generation ---------------------- */

/** One at a time so batch uploads never hammer the vision endpoint. */
let metaChain: Promise<void> = Promise.resolve();

function enqueueMeta(id: string) {
  metaChain = metaChain
    .then(() => generateMetadataNow(id))
    .catch(() => undefined);
}

async function generateMetadataNow(id: string): Promise<void> {
  const item = useStore.getState().items.find((i) => i.id === id);
  if (!item || item.status !== 'done' || !item.result?.url) return;
  patchItem(id, { metaState: 'loading', metaError: undefined });
  try {
    const proxy = await makeAnalyzeProxy(item.result.url);
    const form = new FormData();
    form.append('file', new File([proxy], 'proxy.jpg', { type: 'image/jpeg' }));
    const res = await fetch('/api/analyze', { method: 'POST', body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Analysis failed (${res.status})`);
    }
    const data = (await res.json()) as {
      title: string;
      description: string;
      keywords: string[];
      category: number;
      flags: StockMeta['flags'];
    };
    patchItem(id, {
      meta: {
        title: data.title,
        description: data.description,
        keywords: data.keywords,
        category: data.category,
        flags: data.flags,
        aiGenerated: true,
      },
      metaState: 'ready',
    });
  } catch (err) {
    patchItem(id, {
      metaState: 'error',
      metaError: err instanceof Error ? err.message : 'Analysis failed',
    });
  }
}

/* ------------------------------------------------------------------ */

export const useStore = create<UpscalerState>()(
  persist(
    (set, get) => ({
      items: [],
      settings: { ...DEFAULT_SETTINGS },
      busy: false,
      paused: false,
      activeId: null,
      totals: initialTotals,
      compareId: null,

      addFiles: async (files) => {
        const list = files.filter(
          (f) =>
            f.size > 0 &&
            (f.type.startsWith('image/') || /\.(heic|heif|hif|tif|tiff|avif|webp|bmp)$/i.test(f.name))
        );
        if (!list.length) {
          const { toast } = await import('sonner');
          toast.error('No supported images found', {
            description: 'Drop JPEG, PNG, WebP, AVIF, GIF, BMP, HEIC or TIFF files.',
          });
          return;
        }
        const capped = list.slice(0, MAX_BATCH_FILES);
        // duplicate guard: same name + byte size already queued (or twice in
        // this batch) would just waste time on an identical job
        const seen = new Set<string>();
        for (const it of useStore.getState().items) {
          if (it.file) seen.add(`${it.name}:${it.sizeIn}`);
        }
        let dupes = 0;
        const items: QueueItem[] = [];
        for (const file of capped) {
          const key = `${file.name || 'image'}:${file.size}`;
          if (seen.has(key)) {
            dupes++;
            continue;
          }
          seen.add(key);
          const id = crypto.randomUUID();
          const name = file.name || `image-${id.slice(0, 6)}`;
          try {
            const { bitmap, renderable } = await decodeImageFile(file);
            const pixels = bitmap.width * bitmap.height;
            if (pixels > MAX_INPUT_PIXELS) {
              bitmap.close();
              items.push({
                id,
                file,
                name,
                mime: file.type || 'image/*',
                sizeIn: file.size,
                w: 0,
                h: 0,
                thumbUrl: '',
                originalUrl: '',
                status: 'error',
                progress: 0,
                phase: 'Failed',
                error: `Image is ${Math.round(pixels / 1e6)}MP. Max input is ${Math.round(MAX_INPUT_PIXELS / 1e6)}MP.`,
              });
              continue;
            }
            const thumbUrl = await makeThumbUrl(bitmap);
            const originalUrl = renderable ? URL.createObjectURL(file) : await makePreviewUrl(bitmap);
            const w = bitmap.width;
            const h = bitmap.height;
            bitmap.close();
            items.push({
              id,
              file,
              name,
              mime: file.type || 'image/*',
              sizeIn: file.size,
              w,
              h,
              thumbUrl,
              originalUrl,
              status: 'queued',
              progress: 0,
              phase: 'Queued',
            });
          } catch (err) {
            items.push({
              id,
              file,
              name,
              mime: file.type || 'image/*',
              sizeIn: file.size,
              w: 0,
              h: 0,
              thumbUrl: '',
              originalUrl: '',
              status: 'error',
              progress: 0,
              phase: 'Failed',
              error: err instanceof Error ? err.message : 'Could not decode image',
            });
          }
        }
        set((s) => ({ items: [...s.items, ...items] }));
        if (dupes > 0) {
          const { toast } = await import('sonner');
          toast.info(`${dupes} duplicate file${dupes > 1 ? 's' : ''} skipped`, {
            description: 'Already in the queue.',
          });
        }
        const skipped = list.length - capped.length;
        if (skipped > 0) {
          const { toast } = await import('sonner');
          toast.warning(`${skipped} file${skipped > 1 ? 's' : ''} skipped`, {
            description: `Batch limit is ${MAX_BATCH_FILES} images at a time.`,
          });
        }
        void ensureLoop();
      },

      addSample: async (kind: SampleKind = 'photo') => {
        const { createSampleFile } = await import('./utils');
        try {
          const file = await createSampleFile(kind);
          await get().addFiles([file]);
        } catch (err) {
          const { toast } = await import('sonner');
          toast.error('Could not create the sample image');
          console.error(err);
        }
      },

      removeItem: (id) => {
        const s = get();
        const item = s.items.find((i) => i.id === id);
        if (!item) return;
        cancelActive(id);
        if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.result?.url) URL.revokeObjectURL(item.result.url);
        void idbDeleteResult(id);
        set((st) => ({
          items: st.items.filter((i) => i.id !== id),
          compareId: st.compareId === id ? null : st.compareId,
        }));
      },

      clearFinished: () => {
        const s = get();
        for (const item of s.items) {
          if (item.status === 'done' || item.status === 'canceled' || item.status === 'error') {
            if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
            if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
            if (item.result?.url) URL.revokeObjectURL(item.result.url);
            void idbDeleteResult(item.id);
          }
        }
        set((st) => ({
          items: st.items.filter((i) => i.status === 'queued' || i.status === 'processing'),
          compareId: null,
        }));
      },

      clearAll: () => {
        const s = get();
        for (const item of s.items) {
          cancelActive(item.id);
          if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
          if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
          if (item.result?.url) URL.revokeObjectURL(item.result.url);
        }
        void idbClearResults();
        set({ items: [], compareId: null, totals: initialTotals });
      },

      retry: (id) => {
        patchItem(id, {
          status: 'queued',
          progress: 0,
          phase: 'Queued',
          error: undefined,
          result: undefined,
        });
        void ensureLoop();
      },

      toggleZip: (id) => {
        useStore.setState((s) => ({
          items: s.items.map((it) => (it.id === id ? { ...it, zip: it.zip === false } : it)),
        }));
      },

      restorePersisted: async () => {
        let rows: Array<PersistedResult & { id: string }> = [];
        try {
          rows = await idbLoadResults();
        } catch {
          return 0;
        }
        if (!rows.length) return 0;
        const existing = new Set(useStore.getState().items.map((i) => i.id));
        const items: QueueItem[] = [];
        for (const row of rows) {
          if (existing.has(row.id)) continue;
          items.push({
            id: row.id,
            file: null,
            name: row.name,
            mime: row.mime,
            sizeIn: row.sizeIn,
            w: row.w,
            h: row.h,
            thumbUrl: URL.createObjectURL(row.thumb),
            originalUrl: URL.createObjectURL(row.original),
            status: 'done',
            progress: 1,
            phase: 'Done',
            result: {
              url: URL.createObjectURL(row.result.blob),
              size: row.result.blob.size,
              w: row.result.w,
              h: row.result.h,
              ms: row.result.ms,
              scale: row.result.scale,
              format: row.result.format,
              clamped: row.result.clamped,
              engine: row.result.engine ?? 'standard',
              tiles: row.result.tiles ?? 0,
              target: row.result.target,
            },
            restored: true,
          });
        }
        if (items.length) {
          set((s) => ({ items: [...items, ...s.items] }));
        }
        return items.length;
      },

      setSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      togglePause: () => {
        const wasPaused = get().paused;
        set({ paused: !wasPaused });
        if (wasPaused) void ensureLoop();
      },

      setCompare: (id) => set({ compareId: id }),

      generateMetadata: async (id) => {
        const item = useStore.getState().items.find((i) => i.id === id);
        if (!item || item.status !== 'done' || !item.result?.url) return;
        if (item.metaState === 'loading') return;
        enqueueMeta(id);
        await metaChain;
      },

      updateMeta: (id, patch) => {
        useStore.setState((s) => ({
          items: s.items.map((it) =>
            it.id === id && it.meta ? { ...it, meta: { ...it.meta, ...patch, aiGenerated: false } } : it
          ),
        }));
      },
    }),
    {
      name: 'pixelforge-settings',
      version: 1,
      // persist only user preferences — never queue items (blob URLs die anyway)
      partialize: (s) => ({ settings: s.settings }) as unknown as UpscalerState,
      // hydration is triggered manually from <Workspace /> after mount so the
      // server-rendered markup never mismatches
      skipHydration: true,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UpscalerState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        };
      },
    }
  )
);

/* ------------------------------------------------------------------ */
/* Download helpers (kept near the store so components stay dumb)      */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function resultFilename(
  name: string,
  scale: ScaleFactor,
  format: OutputFormat,
  target?: number
): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  const label = target ? `${target}px` : `${scale}x`;
  return `${base}_${label}_upscaled.${extForFormat(format)}`;
}

export async function downloadAllAsZip() {
  const { items } = useStore.getState();
  const done = items.filter((i) => i.status === 'done' && i.result && i.zip !== false);
  if (!done.length) return;
  const { toast } = await import('sonner');
  const t = toast.loading(`Packing ${done.length} image${done.length > 1 ? 's' : ''}…`);
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const used = new Set<string>();
    for (const item of done) {
      const r = item.result!;
      let filename = resultFilename(item.name, r.scale, r.format, r.target);
      let i = 1;
      while (used.has(filename)) {
        filename = resultFilename(item.name, r.scale, r.format, r.target).replace(
          /(\.\w+)$/,
          `_${i++}$1`
        );
      }
      used.add(filename);
      const blob = await (await fetch(r.url)).blob();
      zip.file(filename, blob);
    }
    const out = await zip.generateAsync({ type: 'blob' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    downloadBlob(out, `stockprep_${stamp}.zip`);
    toast.success(`ZIP ready. ${formatBytes(out.size)}`, { id: t });
  } catch (err) {
    console.error(err);
    toast.error('Could not build the ZIP archive', { id: t });
  }
}

/**
 * Builds the Adobe Stock submission package:
 *   images/*.jpg                    every included result as submission JPEG
 *   adobe-stock-metadata.csv        Filename, Title, Keywords, Category
 *   README.txt                      three step upload reminder
 */
export async function exportAdobePackage(): Promise<void> {
  const { items } = useStore.getState();
  const done = items.filter((i) => i.status === 'done' && i.result && i.zip !== false);
  if (!done.length) return;
  const { toast } = await import('sonner');
  const t = toast.loading(`Packing ${done.length} image${done.length > 1 ? 's' : ''}…`);
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const imgFolder = zip.folder('images');
    const rows: { filename: string; title: string; keywords: string[]; category: number }[] = [];
    const used = new Set<string>();
    let unnamed = 0;
    for (const item of done) {
      const r = item.result!;
      let filename = `${slugify(item.name)}.jpg`;
      let i = 2;
      while (used.has(filename)) filename = `${slugify(item.name)}-${i++}.jpg`;
      used.add(filename);
      const blob = await toJpegBlob(r.url);
      imgFolder?.file(filename, blob);
      const meta = item.meta;
      if (!meta) unnamed++;
      rows.push({
        filename,
        title: meta?.title.trim() || slugify(item.name),
        keywords: meta ? meta.keywords.slice(0, 49) : [],
        category: meta?.category ?? 0,
      });
    }
    zip.file('adobe-stock-metadata.csv', buildStockCsv(rows));
    zip.file('README.txt', STOCK_README);
    const out = await zip.generateAsync({ type: 'blob' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    downloadBlob(out, `adobe-stock_${stamp}.zip`);
    toast.success('Adobe Stock package ready', {
      id: t,
      description:
        unnamed > 0
          ? `${unnamed} image${unnamed > 1 ? 's' : ''} without metadata use filename placeholders.`
          : `${done.length} JPEG files plus the metadata CSV.`,
    });
  } catch (err) {
    console.error(err);
    toast.error('Could not build the package', { id: t });
  }
}
