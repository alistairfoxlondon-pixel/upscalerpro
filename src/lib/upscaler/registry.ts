import type { PresetId, PresetMeta, ScaleFactor } from './types';

export const PRESETS: Record<PresetId, PresetMeta> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    model: 'ESRGAN-Slim',
    sizeMB: 1,
    desc: 'Great all-round quality, quickest results.',
    speed: 3,
    quality: 1,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    model: 'ESRGAN-Medium',
    sizeMB: 3,
    desc: 'Noticeably finer detail on photos.',
    speed: 2,
    quality: 2,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    model: 'ESRGAN-Thick',
    sizeMB: 29,
    desc: 'Maximum detail recovery. Slow — best for small images.',
    speed: 1,
    quality: 3,
  },
};

export const PRESET_ORDER: PresetId[] = ['fast', 'balanced', 'studio'];

export const SCALES: ScaleFactor[] = [2, 3, 4, 8];

/** Safety caps so a huge image can't blow up device memory. */
export const MAX_OUT_DIM = 8192;
export const MAX_OUT_PIXELS = 34_000_000;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_BATCH_FILES = 50;

export function resolveFormat(mime: string, name: string): 'jpeg' | 'png' | 'webp' {
  const m = (mime || '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (m === 'image/jpeg' || m === 'image/jpg' || ext === 'jpg' || ext === 'jpeg' || m === 'image/heic' || m === 'image/heif' || ext === 'heic' || ext === 'heif') {
    return 'jpeg';
  }
  if (m === 'image/webp' || ext === 'webp') return 'webp';
  return 'png';
}

export function extForFormat(f: 'jpeg' | 'png' | 'webp'): string {
  return f === 'jpeg' ? 'jpg' : f;
}

/* ------------------------- target-size scale mode ------------------------- */

/** Quick-pick longest-side targets (labelled in the settings panel). */
export const TARGET_PRESETS: { side: number; label: string }[] = [
  { side: 1280, label: 'HD' },
  { side: 1920, label: 'FHD' },
  { side: 2560, label: '2K' },
  { side: 3840, label: '4K' },
];
/** Bounds for the custom target input. */
export const TARGET_MIN = 320;
export const TARGET_MAX = 8192;

export interface SizeFit {
  scale: ScaleFactor;
  /** final output dimensions (exact target in target mode) */
  outW: number;
  outH: number;
  /** memory-cap clamp was applied (factor mode only) */
  clamped?: boolean;
  /** required factor exceeded 8× — output lands at 8× instead of the target */
  short?: boolean;
  /** human-readable reason when the target is unreachable */
  error?: string;
}

/**
 * Factor mode: pick the largest scale that is <= requested and within memory
 * caps. 8× runs as a chained 4×→2× pass in the worker; the memory math is the
 * same as a plain 8× (64× more pixels), so the caps below guard both cases.
 * Returns null when not even 2x is possible.
 */
export function resolveScale(w: number, h: number, requested: ScaleFactor): SizeFit | null {
  for (const s of [requested, 4, 3, 2] as ScaleFactor[]) {
    if (s > requested) continue;
    const ow = w * s;
    const oh = h * s;
    if (ow <= MAX_OUT_DIM && oh <= MAX_OUT_DIM && ow * oh <= MAX_OUT_PIXELS) {
      return { scale: s, outW: ow, outH: oh, clamped: s !== requested };
    }
  }
  return null;
}

/**
 * Target mode: reach an exact longest-side size. The smallest AI scale that
 * meets the target is used (2× minimum — there is no 1× model), then the
 * worker resizes the AI output down to the exact target, so the AI always
 * works at or above the requested resolution (never interpolated up).
 */
export function resolveScaleForTarget(w: number, h: number, targetSide: number): SizeFit {
  const longest = Math.max(w, h);
  if (!Number.isFinite(targetSide) || targetSide < TARGET_MIN) {
    return { scale: 2, outW: w * 2, outH: h * 2, error: 'Target size is too small' };
  }
  if (targetSide > MAX_OUT_DIM) {
    return { scale: 2, outW: w * 2, outH: h * 2, error: `Target size is capped at ${MAX_OUT_DIM} px` };
  }
  if (targetSide <= longest) {
    return { scale: 2, outW: w * 2, outH: h * 2, error: 'Target must be larger than the original image' };
  }
  const required = targetSide / longest;
  let scale: ScaleFactor | null = null;
  for (const s of [2, 3, 4, 8] as ScaleFactor[]) {
    if (s >= required) {
      scale = s;
      break;
    }
  }
  const short = scale === null;
  const fit: ScaleFactor = (scale ?? 8) as ScaleFactor;
  const reaches = (s: ScaleFactor) =>
    w * s <= MAX_OUT_DIM && h * s <= MAX_OUT_DIM && w * s * h * s <= MAX_OUT_PIXELS;
  if (!reaches(fit)) {
    // The smallest scale that meets the target busts the memory caps —
    // land short at the largest scale that fits rather than failing outright.
    const shortScale = ([4, 3, 2] as ScaleFactor[]).find((s) => s < fit && reaches(s));
    if (!shortScale) {
      return {
        scale: 2,
        outW: w * 2,
        outH: h * 2,
        error: 'Image is too large to upscale on this device',
      };
    }
    return { scale: shortScale, outW: w * shortScale, outH: h * shortScale, short: true };
  }
  if (short) {
    // requested factor beyond 8× — land at 8× (worker skips the resize)
    return { scale: 8, outW: w * 8, outH: h * 8, short: true };
  }
  const k = targetSide / longest;
  return {
    scale: fit,
    outW: Math.max(1, Math.round(w * k)),
    outH: Math.max(1, Math.round(h * k)),
  };
}
