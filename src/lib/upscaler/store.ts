'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeImageFile } from './decode';
import { MAX_BATCH_FILES, MAX_INPUT_PIXELS, extForFormat, resolveFormat, resolveScale } from './registry';
import type {
  FormatChoice,
  OutputFormat,
  PresetId,
  ScaleFactor,
  WorkerOutMessage,
} from './types';
import { formatBytes } from './utils';
import { makePreviewUrl, makeThumbUrl } from './utils';
import { onWorkerMessage, postToWorker, resetWorker } from './worker-client';

export type ItemStatus = 'queued' | 'processing' | 'done' | 'error' | 'canceled';

export interface ResultData {
  url: string;
  size: number;
  w: number;
  h: number;
  ms: number;
  scale: ScaleFactor;
  preset: PresetId;
  format: OutputFormat;
  clamped: boolean;
}

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  mime: string;
  sizeIn: number;
  w: number;
  h: number;
  thumbUrl: string;
  originalUrl: string;
  status: ItemStatus;
  progress: number; // 0..1
  phase: string;
  error?: string;
  result?: ResultData;
  cpuRetry?: boolean;
}

export interface Settings {
  preset: PresetId;
  scale: ScaleFactor;
  format: FormatChoice;
  jpegQuality: number;
  /** 0 = off, 1 = light median denoise, 2 = strong */
  denoise: 0 | 1 | 2;
  /** unsharp-mask sharpening after upscale */
  sharpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  preset: 'balanced',
  scale: 4,
  format: 'auto',
  jpegQuality: 0.92,
  denoise: 0,
  sharpen: false,
};

export interface Totals {
  images: number;
  pixelsIn: number;
  pixelsOut: number;
  ms: number;
  bytesIn: number;
  bytesOut: number;
}

interface UpscalerState {
  items: QueueItem[];
  settings: Settings;
  busy: boolean;
  paused: boolean;
  activeId: string | null;
  backend: string | null;
  gpu: string | null;
  modelKey: string | null;
  modelStatus: 'loading' | 'ready' | 'error' | null;
  modelMessage: string | null;
  totals: Totals;
  compareId: string | null;

  addFiles: (files: File[]) => Promise<void>;
  addSample: () => Promise<void>;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  clearAll: () => void;
  retry: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  togglePause: () => void;
  setCompare: (id: string | null) => void;
}

/* ------------------------------------------------------------------ */

let workerWired = false;
const pending = new Map<string, { resolve: () => void }>();
const stallTimers = new Map<string, ReturnType<typeof setTimeout>>();
const STALL_TIMEOUT_MS = 300_000;
let loopRunning = false;

function touchStall(id: string) {
  const prev = stallTimers.get(id);
  if (prev) clearTimeout(prev);
  stallTimers.set(
    id,
    setTimeout(() => {
      stallTimers.delete(id);
      onStall(id);
    }, STALL_TIMEOUT_MS)
  );
}

function clearStall(id: string) {
  const prev = stallTimers.get(id);
  if (prev) clearTimeout(prev);
  stallTimers.delete(id);
}

async function onStall(id: string) {
  if (!pending.has(id)) return;
  const item = useStore.getState().items.find((i) => i.id === id);
  if (!item) return;
  const { toast } = await import('sonner');
  if (item.cpuRetry) {
    console.error('[pixelforge] processing stalled even on CPU fallback', id);
    patchItem(id, {
      status: 'error',
      phase: 'Failed',
      error: 'Processing stalled — try a smaller image or the Fast engine',
      result: undefined,
    });
    pending.get(id)?.resolve();
    pending.delete(id);
    return;
  }
  // The GPU readback is wedged — a cancel cannot unblock the worker's job
  // chain, so terminate it and give the retry a fresh worker + CPU backend.
  toast.info('Graphics engine stalled — restarting worker and retrying on CPU (slower but reliable)');
  resetWorker();
  patchItem(id, {
    cpuRetry: true,
    status: 'queued',
    phase: 'Queued (CPU retry)',
    progress: 0,
    result: undefined,
  });
  pending.get(id)?.resolve();
  pending.delete(id);
}

function patchItem(id: string, patch: Partial<QueueItem>) {
  useStore.setState((s) => ({
    items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
  }));
}

function wireWorker() {
  if (workerWired) return;
  workerWired = true;
  onWorkerMessage((m: WorkerOutMessage) => {
    const state = useStore.getState();
    switch (m.type) {
      case 'backend':
        useStore.setState({ backend: m.backend, gpu: m.renderer ?? null });
        break;
      case 'debug':
        console.info('[pf-worker]', m.text);
        break;
      case 'phase':
        if (pending.has(m.id)) {
          touchStall(m.id);
          patchItem(m.id, { phase: m.phase });
        }
        break;
      case 'model-status': {
        const key = `${m.preset}:${m.scale}`;
        if (state.modelKey === key || m.status === 'error') {
          useStore.setState({ modelStatus: m.status, modelMessage: m.message ?? null });
        }
        if (m.status === 'loading' && state.activeId) {
          patchItem(state.activeId, { phase: 'Loading AI model' });
          touchStall(state.activeId);
        }
        if (m.status === 'ready' && state.activeId) {
          const active = state.items.find((i) => i.id === state.activeId);
          if (active && active.phase === 'Loading AI model') {
            patchItem(active.id, { phase: 'Upscaling' });
          }
        }
        break;
      }
      case 'progress':
        touchStall(m.id);
        patchItem(m.id, {
          progress: 0.02 + m.rate * 0.93,
          phase: m.rate >= 0.999 ? 'Finalizing' : 'Upscaling',
        });
        break;
      case 'done': {
        if (!pending.has(m.id)) break; // stale message (item re-queued or removed)
        clearStall(m.id);
        const item = state.items.find((i) => i.id === m.id);
        const url = URL.createObjectURL(m.blob);
        const planned = item?.result;
        const result: ResultData = {
          url,
          size: m.blob.size,
          w: m.width,
          h: m.height,
          ms: m.ms,
          scale: (planned?.scale ?? useStore.getState().settings.scale) as ScaleFactor,
          preset: (planned?.preset ?? useStore.getState().settings.preset) as PresetId,
          format: m.blob.type.includes('jpeg')
            ? 'jpeg'
            : m.blob.type.includes('webp')
              ? 'webp'
              : 'png',
          clamped: planned?.clamped ?? false,
        };
        patchItem(m.id, {
          status: 'done',
          progress: 1,
          phase: 'Done',
          result,
        });
        useStore.setState((s) => ({
          totals: {
            images: s.totals.images + 1,
            pixelsIn: s.totals.pixelsIn + (item ? item.w * item.h : 0),
            pixelsOut: s.totals.pixelsOut + m.width * m.height,
            ms: s.totals.ms + m.ms,
            bytesIn: s.totals.bytesIn + (item?.sizeIn ?? 0),
            bytesOut: s.totals.bytesOut + m.blob.size,
          },
        }));
        pending.get(m.id)?.resolve();
        pending.delete(m.id);
        break;
      }
      case 'error': {
        if (!pending.has(m.id)) break; // stale message (item re-queued or removed)
        clearStall(m.id);
        const canceled = /^canceled$/i.test(m.message);
        patchItem(m.id, {
          status: canceled ? 'canceled' : 'error',
          phase: canceled ? 'Canceled' : 'Failed',
          error: canceled ? undefined : m.message,
          progress: 0,
          result: undefined,
        });
        if (!canceled) {
          console.error('[pixelforge]', m.message);
          void import('sonner').then(({ toast }) =>
            toast.error('Upscaling failed', { description: m.message })
          );
        }
        pending.get(m.id)?.resolve();
        pending.delete(m.id);
        break;
      }
    }
  });
}

async function processItem(id: string): Promise<void> {
  const state = useStore.getState();
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const { preset, scale, format, jpegQuality, denoise, sharpen } = state.settings;

  patchItem(id, { status: 'processing', progress: 0, phase: 'Preparing', error: undefined });
  useStore.setState({ activeId: id });

  const resolved: OutputFormat = format === 'auto' ? resolveFormat(item.mime, item.name) : format;

  // memory safety: pick the largest allowed scale
  const fit = resolveScale(item.w, item.h, scale);
  if (!fit) {
    patchItem(id, {
      status: 'error',
      phase: 'Failed',
      error: 'Image is too large to upscale on this device',
    });
    return;
  }

  try {
    const { bitmap } = await decodeImageFile(item.file);
    const modelKey = `${preset}:${fit.scale}`;
    useStore.setState({ modelKey, modelStatus: null, modelMessage: null });
    patchItem(id, {
      phase: 'Loading model',
      progress: 0.01,
      // planned result placeholder — carries the plan (scale/format) and
      // estimated output size until the worker reports the real values
      result: {
        url: '',
        size: 0,
        w: item.w * fit.scale,
        h: item.h * fit.scale,
        ms: 0,
        scale: fit.scale,
        preset,
        format: resolved,
        clamped: fit.clamped,
      },
    });
    const done = new Promise<void>((resolve) => pending.set(id, { resolve }));
    touchStall(id);
    postToWorker(
      {
        type: 'upscale',
        id,
        bitmap,
        scale: fit.scale,
        preset,
        format: resolved,
        quality: jpegQuality,
        denoise,
        sharpen,
        backendHint: item.cpuRetry ? 'cpu' : undefined,
      },
      [bitmap]
    );
    await done;
    clearStall(id);
  } catch (err) {
    patchItem(id, {
      status: 'error',
      phase: 'Failed',
      error: err instanceof Error ? err.message : 'Could not decode image',
      result: undefined,
    });
  }
}

async function ensureLoop() {
  if (loopRunning) return;
  loopRunning = true;
  useStore.setState({ busy: true });
  let completed = 0;
  try {
    for (;;) {
      const s = useStore.getState();
      if (s.paused) break;
      const next = s.items.find((i) => i.status === 'queued');
      if (!next) break;
      await processItem(next.id);
      const after = useStore.getState().items.find((i) => i.id === next.id);
      if (after?.status === 'done') completed++;
    }
  } finally {
    loopRunning = false;
    useStore.setState({ busy: false, activeId: null });
    // batch-complete feedback with a one-tap ZIP export
    if (completed > 0 && !useStore.getState().paused) {
      const { toast } = await import('sonner');
      toast.success(completed === 1 ? '1 image ready' : `${completed} images ready`, {
        description: 'Processed entirely on this device.',
        action: { label: 'Download ZIP', onClick: () => void downloadAllAsZip() },
        duration: 10_000,
      });
    }
  }
}

/* ------------------------------------------------------------------ */

const initialTotals: Totals = {
  images: 0,
  pixelsIn: 0,
  pixelsOut: 0,
  ms: 0,
  bytesIn: 0,
  bytesOut: 0,
};

export const useStore = create<UpscalerState>()(
  persist(
    (set, get) => ({
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  busy: false,
  paused: false,
  activeId: null,
  backend: null,
  gpu: null,
  modelKey: null,
  modelStatus: null,
  modelMessage: null,
  totals: initialTotals,
  compareId: null,

  addFiles: async (files) => {
    wireWorker();
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
    const items: QueueItem[] = [];
    for (const file of capped) {
      const id = crypto.randomUUID();
      const name = file.name || `image-${id.slice(0, 6)}`;
      try {
        const { bitmap, renderable } = await decodeImageFile(file);
        const pixels = bitmap.width * bitmap.height;
        if (pixels > MAX_INPUT_PIXELS) {
          bitmap.close();
          items.push({
            id, file, name, mime: file.type || 'image/*', sizeIn: file.size,
            w: 0, h: 0, thumbUrl: '', originalUrl: '',
            status: 'error', progress: 0, phase: 'Failed',
            error: `Image is ${Math.round(pixels / 1e6)}MP — max input is ${Math.round(MAX_INPUT_PIXELS / 1e6)}MP`,
          });
          continue;
        }
        const thumbUrl = await makeThumbUrl(bitmap);
        const originalUrl = renderable ? URL.createObjectURL(file) : await makePreviewUrl(bitmap);
        const w = bitmap.width;
        const h = bitmap.height;
        bitmap.close();
        items.push({
          id, file, name, mime: file.type || 'image/*', sizeIn: file.size,
          w, h, thumbUrl, originalUrl,
          status: 'queued', progress: 0, phase: 'Queued',
        });
      } catch (err) {
        items.push({
          id, file, name, mime: file.type || 'image/*', sizeIn: file.size,
          w: 0, h: 0, thumbUrl: '', originalUrl: '',
          status: 'error', progress: 0, phase: 'Failed',
          error: err instanceof Error ? err.message : 'Could not decode image',
        });
      }
    }
    set((s) => ({ items: [...s.items, ...items] }));
    const skipped = list.length - capped.length;
    if (skipped > 0) {
      const { toast } = await import('sonner');
      toast.warning(`${skipped} file${skipped > 1 ? 's' : ''} skipped`, {
        description: `Batch limit is ${MAX_BATCH_FILES} images at a time.`,
      });
    }
    void ensureLoop();
  },

  addSample: async () => {
    const { createSampleFile } = await import('./utils');
    try {
      const file = await createSampleFile();
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
    if (item.status === 'processing') {
      postToWorker({ type: 'cancel', id });
    }
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.result?.url) URL.revokeObjectURL(item.result.url);
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
      }
    }
    set((st) => ({
      items: st.items.filter(
        (i) => i.status === 'queued' || i.status === 'processing'
      ),
      compareId: null,
    }));
  },

  clearAll: () => {
    const s = get();
    for (const item of s.items) {
      if (item.status === 'processing') {
        postToWorker({ type: 'cancel', id: item.id });
      }
      if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.result?.url) URL.revokeObjectURL(item.result.url);
    }
    set({ items: [], compareId: null, totals: initialTotals });
  },

  retry: (id) => {
    patchItem(id, {
      status: 'queued',
      progress: 0,
      phase: 'Queued',
      error: undefined,
      result: undefined,
      cpuRetry: false,
    });
    void ensureLoop();
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

export function resultFilename(name: string, scale: ScaleFactor, format: OutputFormat): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}_${scale}x_upscaled.${extForFormat(format)}`;
}

export async function downloadAllAsZip() {
  const { items } = useStore.getState();
  const done = items.filter((i) => i.status === 'done' && i.result);
  if (!done.length) return;
  const { toast } = await import('sonner');
  const t = toast.loading(`Packing ${done.length} image${done.length > 1 ? 's' : ''}…`);
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const used = new Set<string>();
    for (const item of done) {
      const r = item.result!;
      let filename = resultFilename(item.name, r.scale, r.format);
      let i = 1;
      while (used.has(filename)) {
        filename = resultFilename(item.name, r.scale, r.format).replace(/(\.\w+)$/, `-${i++}$1`);
      }
      used.add(filename);
      const blob = await (await fetch(r.url)).blob();
      zip.file(filename, blob);
    }
    const out = await zip.generateAsync({ type: 'blob' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    downloadBlob(out, `pixelforge-upscaled-${stamp}.zip`);
    toast.success(`ZIP ready — ${formatBytes(out.size)}`, { id: t });
  } catch (err) {
    console.error(err);
    toast.error('Could not build the ZIP archive', { id: t });
  }
}
