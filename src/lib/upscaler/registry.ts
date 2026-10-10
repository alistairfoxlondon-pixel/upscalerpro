import type { EngineChoice, ScaleFactor, Settings } from './types';

export const SCALES: ScaleFactor[] = [2, 3, 4, 8];

/** Safety caps so one image can not produce an absurd output. */
export const MAX_OUT_DIM = 8192;
export const MAX_OUT_PIXELS = 34_000_000;
export const MAX_INPUT_PIXELS = 30_000_000;
export const MAX_INPUT_SIDE = 8192;
export const MAX_BATCH_FILES = 50;

/** Must mirror the server (engine.ts). AI inference budget per image. */
export const AI_INPUT_MAX_SIDE = 1280;

/** Upload budget: the target platform accepts about 4.5 MB per request. */
export const MAX_UPLOAD_BYTES = 4.2 * 1024 * 1024;

export function resolveFormat(mime: string, name: string): 'jpeg' | 'png' | 'webp' {
  const m = (mime || '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    m === 'image/heic' ||
    m === 'image/heif' ||
    ext === 'heic' ||
    ext === 'heif'
  ) {
    return 'jpeg';
  }
  if (m === 'image/webp' || ext === 'webp') return 'webp';
  return 'png';
}

export function extForFormat(f: 'jpeg' | 'png' | 'webp'): string {
  return f === 'jpeg' ? 'jpg' : f;
}

/* ------------------------- target presets ------------------------- */

/** Quick pick longest side targets. */
export const TARGET_PRESETS: { side: number; label: string }[] = [
  { side: 1280, label: 'HD' },
  { side: 1920, label: 'FHD' },
  { side: 2560, label: '2K' },
  { side: 3840, label: '4K' },
];
export const TARGET_MIN = 320;
export const TARGET_MAX = 8192;

export interface SizePlan {
  /** effective scale used for the badge / filename */
  scale: ScaleFactor;
  outW: number;
  outH: number;
  /** factor mode: requested scale exceeded the caps and was reduced */
  clamped?: boolean;
  /** target mode: caps forced a smaller result than the target */
  short?: boolean;
  /** AI engine will be skipped for this image (too large to infer in time) */
  aiFallback?: boolean;
  /** human readable reason when the request can not be satisfied */
  error?: string;
}

function fits(w: number, h: number, s: number): boolean {
  return w * s <= MAX_OUT_DIM && h * s <= MAX_OUT_DIM && w * s * h * s <= MAX_OUT_PIXELS;
}

/** Factor mode: requested scale when it fits, else the largest that fits. */
export function planFactor(w: number, h: number, requested: ScaleFactor): SizePlan | null {
  for (const s of [requested, 4, 3, 2] as ScaleFactor[]) {
    if (s > requested) continue;
    if (fits(w, h, s)) {
      return { scale: s, outW: w * s, outH: h * s, clamped: s !== requested };
    }
  }
  return null;
}

/**
 * Target mode: exact longest side. Targets above the original size upscale,
 * smaller targets downscale. Both are handled server side.
 */
export function planTarget(w: number, h: number, targetSide: number): SizePlan {
  const longest = Math.max(w, h);
  if (!Number.isFinite(targetSide) || targetSide < TARGET_MIN) {
    return { scale: 2, outW: w * 2, outH: h * 2, error: 'Target size is too small' };
  }
  if (targetSide > MAX_OUT_DIM) {
    return { scale: 2, outW: w * 2, outH: h * 2, error: `Target size is capped at ${MAX_OUT_DIM} px` };
  }
  if (targetSide <= longest) {
    // downscale: pure high quality resize, report the effective factor
    const k = targetSide / longest;
    const s = (Math.max(1, Math.round(k)) || 1) as ScaleFactor;
    return { scale: s, outW: Math.max(1, Math.round(w * k)), outH: Math.max(1, Math.round(h * k)) };
  }
  const required = targetSide / longest;
  const fit = (required <= 2 ? 2 : required <= 3 ? 3 : required <= 4 ? 4 : 8) as ScaleFactor;
  if (!fits(w, h, fit)) {
    const shortScale = ([4, 3, 2] as ScaleFactor[]).find((s) => s < fit && fits(w, h, s));
    if (!shortScale) {
      return { scale: 2, outW: w * 2, outH: h * 2, error: 'Image is too large to upscale' };
    }
    return { scale: shortScale, outW: w * shortScale, outH: h * shortScale, short: true };
  }
  if (required > 8) {
    return { scale: 8, outW: w * 8, outH: h * 8, short: true };
  }
  const k = targetSide / longest;
  return {
    scale: fit,
    outW: Math.max(1, Math.round(w * k)),
    outH: Math.max(1, Math.round(h * k)),
  };
}

/** Resolve the output plan for current settings. */
export function planOutput(
  w: number,
  h: number,
  settings: Pick<Settings, 'scaleMode' | 'scale' | 'targetSide' | 'engine'>
): SizePlan | null {
  const plan =
    settings.scaleMode === 'target'
      ? planTarget(w, h, settings.targetSide)
      : planFactor(w, h, settings.scale);
  if (plan && !plan.error && settings.engine === 'ai' && Math.max(w, h) > AI_INPUT_MAX_SIDE) {
    plan.aiFallback = true;
  }
  return plan;
}
