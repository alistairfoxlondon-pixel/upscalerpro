/**
 * Client-side image decoding for every common format:
 * native (JPEG/PNG/WebP/AVIF/GIF/BMP), plus HEIC/HEIF and TIFF via
 * on-demand dynamic imports (keeps the initial bundle tiny).
 */
export interface DecodedImage {
  bitmap: ImageBitmap;
  /** true when the browser can render the original file in an <img> tag */
  renderable: boolean;
}

const RENDERABLE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

function ext(name: string): string {
  return (name.toLowerCase().split('.').pop() ?? '').trim();
}

function isHeic(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  return ['image/heic', 'image/heif'].includes(t) || ['heic', 'heif', 'hif'].includes(ext(file.name));
}

function isTiff(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  return t === 'image/tiff' || ['tif', 'tiff'].includes(ext(file.name));
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

async function bitmapFromImgElement(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    if (img.decode) {
      await img.decode();
    } else {
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Image failed to load'));
      });
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('Image has no dimensions');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeHeic(file: File): Promise<Blob> {
  const mod = await import('heic2any');
  const heic2any = mod.default;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.94 });
  const blob = Array.isArray(out) ? out[0] : out;
  if (!blob) throw new Error('HEIC conversion failed');
  return blob as Blob;
}

async function decodeTiff(file: File): Promise<ImageData> {
  const UTIF = await import('utif');
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error('Empty TIFF');
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const w = ifds[0].width;
  const h = ifds[0].height;
  if (!w || !h) throw new Error('Invalid TIFF dimensions');
  // copy into a fresh Uint8ClampedArray<ArrayBuffer> for the ImageData constructor
  return new ImageData(new Uint8ClampedArray(rgba), w, h);
}

async function bitmapFromImageData(data: ImageData): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.putImageData(data, 0, 0);
  return createImageBitmap(canvas);
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const renderable = RENDERABLE_MIMES.has((file.type || '').toLowerCase()) && !isHeic(file) && !isTiff(file);
  let bitmap: ImageBitmap | null = null;
  let lastError: unknown = null;

  // 1. native fast path
  try {
    bitmap = await bitmapFromBlob(file);
  } catch (e) {
    lastError = e;
  }

  // 2. HEIC / HEIF → JPEG
  if (!bitmap && isHeic(file)) {
    try {
      const jpeg = await decodeHeic(file);
      bitmap = await bitmapFromBlob(jpeg);
    } catch (e) {
      lastError = e;
    }
  }

  // 3. TIFF → ImageData
  if (!bitmap && isTiff(file)) {
    try {
      bitmap = await bitmapFromImageData(await decodeTiff(file));
    } catch (e) {
      lastError = e;
    }
  }

  // 4. generic <img> fallback (SVG, odd codecs, quirky BMPs…)
  if (!bitmap) {
    try {
      bitmap = await bitmapFromImgElement(file);
    } catch (e) {
      lastError = e;
    }
  }

  if (!bitmap) {
    const msg = lastError instanceof Error ? lastError.message : 'Unsupported or corrupted image';
    throw new Error(msg);
  }

  return { bitmap, renderable };
}
