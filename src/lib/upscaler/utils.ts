export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatMP(pixels: number): string {
  if (pixels >= 1_000_000) return `${(pixels / 1_000_000).toFixed(1)}MP`;
  if (pixels >= 1_000) return `${Math.round(pixels / 1000)}k px`;
  return `${Math.round(pixels)} px`;
}

/**
 * Copies an image (any blob URL / format) to the clipboard as PNG —
 * the one format the async clipboard API accepts everywhere.
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard image copy is not supported in this browser');
  }
  const src = await (await fetch(url)).blob();
  let png = src;
  if (src.type !== 'image/png') {
    const bmp = await createImageBitmap(src);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    png = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png')
    );
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

/** Generates a small WebP/PNG thumbnail object-URL from a bitmap. */
export async function makeThumbUrl(bitmap: ImageBitmap, maxSide = 384): Promise<string> {
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Thumbnail encoding failed');
  return URL.createObjectURL(blob);
}

/** Capped-size PNG preview for inputs the browser cannot render directly (HEIC/TIFF). */
export async function makePreviewUrl(bitmap: ImageBitmap, maxSide = 2048): Promise<string> {
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
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Preview encoding failed');
  return URL.createObjectURL(blob);
}

/**
 * Builds a small, deliberately soft synthetic "photo" so visitors can try
 * the upscaler instantly — generated entirely on-device, no network needed.
 */
export async function createSampleFile(): Promise<File> {
  const W = 1024;
  const H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b1b3d');
  sky.addColorStop(0.55, '#b4462c');
  sky.addColorStop(1, '#f2a65a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // sun
  const sun = ctx.createRadialGradient(W * 0.68, H * 0.42, 4, W * 0.68, H * 0.42, 90);
  sun.addColorStop(0, 'rgba(255,236,190,1)');
  sun.addColorStop(0.5, 'rgba(255,190,120,0.85)');
  sun.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(W * 0.68, H * 0.42, 90, 0, Math.PI * 2);
  ctx.fill();

  // mountains
  const ridge = (base: number, amp: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = base + Math.sin(x * 0.012 + base) * amp + Math.sin(x * 0.004 + base * 2) * amp * 0.7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };
  ridge(H * 0.62, 26, '#7a3b2e');
  ridge(H * 0.72, 22, '#4c2730');
  ridge(H * 0.84, 18, '#2a1a26');

  // birds (fine detail that blurs when downscaled)
  ctx.strokeStyle = 'rgba(20,12,20,0.85)';
  ctx.lineWidth = 2.4;
  const bird = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.quadraticCurveTo(x - s / 2, y - s * 0.7, x, y);
    ctx.quadraticCurveTo(x + s / 2, y - s * 0.7, x + s, y);
    ctx.stroke();
  };
  bird(220, 190, 14);
  bird(280, 160, 10);
  bird(330, 205, 8);

  // fine typography
  ctx.fillStyle = 'rgba(255,244,224,0.95)';
  ctx.font = '600 44px sans-serif';
  ctx.fillText('PIXELFORGE', 64, 118);
  ctx.font = '400 22px sans-serif';
  ctx.fillStyle = 'rgba(255,244,224,0.75)';
  ctx.fillText('neural upscale · sample 01', 66, 152);

  // hairline test pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(640 + i * 10, 60);
    ctx.lineTo(640 + i * 10, 140);
    ctx.stroke();
  }

  // downscale hard → soft, low-res source worth upscaling
  const small = document.createElement('canvas');
  small.width = 96;
  small.height = 72;
  const sctx = small.getContext('2d');
  if (!sctx) throw new Error('Canvas unavailable');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'low';
  sctx.drawImage(canvas, 0, 0, 96, 72);

  const blob = await new Promise<Blob | null>((res) => small.toBlob(res, 'image/jpeg', 0.72));
  if (!blob) throw new Error('Sample encoding failed');
  return new File([blob], 'pixelforge-sample.jpg', { type: 'image/jpeg' });
}
