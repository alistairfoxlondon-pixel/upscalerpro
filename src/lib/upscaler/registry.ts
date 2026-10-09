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

export const SCALES: ScaleFactor[] = [2, 3, 4];

/** Safety caps so a huge image can't blow up device memory. */
export const MAX_OUT_DIM = 8192;
export const MAX_OUT_PIXELS = 34_000_000;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_BATCH_FILES = 50;

/**
 * Pick the largest scale that is <= requested and within memory caps.
 * Returns null when not even 2x is possible.
 */
export function resolveScale(
  w: number,
  h: number,
  requested: ScaleFactor
): { scale: ScaleFactor; clamped: boolean } | null {
  for (const s of [requested, 3, 2] as ScaleFactor[]) {
    if (s > requested) continue;
    const ow = w * s;
    const oh = h * s;
    if (ow <= MAX_OUT_DIM && oh <= MAX_OUT_DIM && ow * oh <= MAX_OUT_PIXELS) {
      return { scale: s, clamped: s !== requested };
    }
  }
  return null;
}

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
