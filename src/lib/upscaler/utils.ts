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

/**
 * Shares an image (any blob URL / format) through the Web Share API as a
 * properly named file. Throws with a readable message when unsupported.
 */
export async function shareImage(url: string, filename: string, title?: string): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    throw new Error('Sharing is not supported in this browser');
  }
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) {
    throw new Error('Sharing files is not supported here');
  }
  await navigator.share({ files: [file], title: title ?? filename });
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

export type SampleKind = 'photo' | 'pixel' | 'text';

export const SAMPLES: { kind: SampleKind; label: string; hint: string }[] = [
  { kind: 'photo', label: 'Photo', hint: 'Soft landscape shot' },
  { kind: 'pixel', label: 'Pixel art', hint: 'Chunky retro sprites' },
  { kind: 'text', label: 'Text scan', hint: 'Tiny document text' },
];

async function canvasToFile(canvas: HTMLCanvasElement, name: string, type: string, quality?: number): Promise<File> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  if (!blob) throw new Error('Sample encoding failed');
  return new File([blob], name, { type });
}

/** Downscale a canvas hard with cheap smoothing → a source worth upscaling. */
function shrink(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(src, 0, 0, w, h);
  return small;
}

function drawPhoto(W: number, H: number): HTMLCanvasElement {
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
  return canvas;
}

/** 40×40 hard-pixel retro scene — ESRGAN loves cleaning these up. */
function drawPixel(): HTMLCanvasElement {
  const N = 40;
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const P = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };

  // dusk sky
  for (let y = 0; y < 26; y++) {
    const t = y / 26;
    const c = t < 0.4 ? '#1b1033' : t < 0.7 ? '#3d1d4e' : '#7a2d4e';
    for (let x = 0; x < N; x++) P(x, y, c);
  }
  // stars
  [[4, 3], [12, 6], [22, 2], [31, 7], [36, 4], [17, 11], [27, 9]].forEach(([x, y]) => P(x, y, '#ffe9c9'));
  // moon
  for (const [x, y] of [[33, 5], [34, 5], [33, 6], [34, 6], [35, 6], [34, 7], [35, 7]]) P(x, y, '#f6e7b2');

  // mountains
  for (let x = 0; x < N; x++) {
    const m1 = Math.round(20 + Math.sin(x * 0.4) * 3 + Math.sin(x * 0.13) * 2);
    const m2 = Math.round(25 + Math.cos(x * 0.3) * 2.5);
    for (let y = m1; y < m2; y++) P(x, y, '#43254a');
    for (let y = Math.max(m1, m2); y < N; y++) P(x, y, '#2b1836');
  }

  // ground
  for (let y = 30; y < N; y++) for (let x = 0; x < N; x++) P(x, y, y % 3 === 0 ? '#182030' : '#141b28');

  // little invader sprite (16:16 in the middle-left)
  const invader = [
    '..X.....X..',
    '...X...X...',
    '..XXXXXXX..',
    '.XX.XXX.XX.',
    'XXXXXXXXXXX',
    'X.XXXXXXX.X',
    'X.X.....X.X',
    '...XX.XX...',
  ];
  const ix = 6;
  const iy = 24;
  for (let r = 0; r < invader.length; r++) {
    for (let c = 0; c < invader[r].length; c++) {
      if (invader[r][c] === 'X') P(ix + c, iy + r, r < 2 ? '#7ef0c9' : '#37c99b');
    }
  }
  // coin (right)
  P(29, 26, '#ffd23e');
  P(30, 26, '#ffd23e');
  P(29, 27, '#e8a621');
  P(30, 27, '#e8a621');
  P(30, 25, '#fff2b0');
  // heart
  [[24, 34], [25, 34], [27, 34], [28, 34], [23, 35], [24, 35], [25, 35], [26, 35], [27, 35], [28, 35], [29, 35], [24, 36], [25, 36], [26, 36], [27, 36], [28, 36], [25, 37], [26, 37], [27, 37], [26, 38]].forEach(([x, y]) => P(x, y, '#ff5c7a'));

  return canvas;
}

/** Crisp text document rendered large, then crushed to a tiny blurry scan. */
function drawText(): HTMLCanvasElement {
  const W = 720;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#fdfcf7';
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = '#1a1a1e';
  ctx.font = '700 44px Georgia, serif';
  ctx.fillText('THE DAILY PIXEL', 48, 88);
  ctx.font = '400 17px sans-serif';
  ctx.fillStyle = '#6b6b70';
  ctx.fillText('Vol. 04 · Server Side Edition · Free forever', 48, 118);

  // rule
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(48, 136, W - 96, 3);

  // headline + paragraph
  ctx.fillStyle = '#1a1a1e';
  ctx.font = '700 30px Georgia, serif';
  ctx.fillText('Sharp upscales, powered by the server', 48, 186);
  ctx.font = '400 19px Georgia, serif';
  const lines = [
    'This page was rendered once at full size and then deliberately',
    'crushed to a fraction of its size. Upscale it back with the text',
    'friendly pipeline and watch the letterforms snap into focus.',
    '',
    'Receipt   2x Coffee ............. $4.00',
    '          1x Domain ............. $0.00',
    '          1x Cloud upload ....... $0.00',
    '          TOTAL ................. $4.00',
  ];
  lines.forEach((line, i) => ctx.fillText(line, 48, 226 + i * 30));

  // signature + date stamp
  ctx.font = 'italic 24px Georgia, serif';
  ctx.fillStyle = '#3a3a40';
  ctx.fillText('The StockPrep Team', 48, 540);
  ctx.save();
  ctx.translate(W - 210, 620);
  ctx.rotate(-0.08);
  ctx.strokeStyle = '#2e5c48';
  ctx.lineWidth = 3;
  ctx.font = '700 26px sans-serif';
  ctx.fillStyle = '#2e5c48';
  ctx.strokeRect(0, 0, 150, 46);
  ctx.fillText('VERIFIED', 18, 32);
  ctx.restore();

  return canvas;
}

/**
 * Synthetic samples so visitors can try the upscaler instantly — generated
 * entirely on-device, no network needed. Each targets a different strength:
 * photo detail, pixel-art edges, and tiny text recovery.
 */
export async function createSampleFile(kind: SampleKind = 'photo'): Promise<File> {
  if (kind === 'pixel') {
    const big = drawPixel();
    const scaled = shrink(big, 60, 60); // 1.5× nearest-ish crush
    return canvasToFile(scaled, 'stockprep-sample-pixelart.png', 'image/png');
  }
  if (kind === 'text') {
    const big = drawText();
    const scaled = shrink(big, 170, 227); // ~24% — text turns genuinely blurry
    return canvasToFile(scaled, 'stockprep-sample-text.jpg', 'image/jpeg', 0.8);
  }
  const photo = drawPhoto(1024, 768);
  const scaled = shrink(photo, 96, 72);
  return canvasToFile(scaled, 'stockprep-sample.jpg', 'image/jpeg', 0.72);
}
