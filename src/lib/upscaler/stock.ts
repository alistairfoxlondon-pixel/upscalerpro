/**
 * Adobe Stock submission rules, readiness scoring and export helpers.
 *
 * Official requirements this mirrors:
 *   resolution  4 MP minimum, 100 MP maximum
 *   file size   45 MB maximum for JPEG
 *   format      JPEG for photos and illustrations
 *   title       up to 200 characters, descriptive, no keyword stuffing
 *   keywords    up to 49, the first ten carry the most search weight
 *   category    one of 21 official categories
 *   content     no watermarks, borders, readable text overlays or logos
 *
 * Everything here runs in the browser, the source images never leave the
 * page except the small proxy sent to /api/analyze.
 */
import type { QueueItem } from './types';

/* ----------------------------- constants ---------------------------- */

export const STOCK = {
  minMP: 4,
  maxMP: 100,
  maxFileMB: 45,
  titleMax: 200,
  titleRecommended: 70,
  keywordsMax: 49,
  keywordsRecommended: 10,
} as const;

export const CATEGORIES: { id: number; name: string }[] = [
  { id: 1, name: 'Animals' },
  { id: 2, name: 'Buildings and Architecture' },
  { id: 3, name: 'Business' },
  { id: 4, name: 'Drinks' },
  { id: 5, name: 'The Environment' },
  { id: 6, name: 'States of Mind' },
  { id: 7, name: 'Food' },
  { id: 8, name: 'Graphic Resources' },
  { id: 9, name: 'Hobbies and Leisure' },
  { id: 10, name: 'Industry' },
  { id: 11, name: 'Landscapes' },
  { id: 12, name: 'Lifestyle' },
  { id: 13, name: 'People' },
  { id: 14, name: 'Plants and Flowers' },
  { id: 15, name: 'Culture and Religion' },
  { id: 16, name: 'Science' },
  { id: 17, name: 'Social Issues' },
  { id: 18, name: 'Sports' },
  { id: 19, name: 'Technology' },
  { id: 20, name: 'Transport' },
  { id: 21, name: 'Travel' },
];

export function categoryName(id: number): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? '';
}

export interface StockFlags {
  watermark: boolean;
  textOverlay: boolean;
  border: boolean;
  logo: boolean;
  aiArtifacts: boolean;
}

export interface StockMeta {
  title: string;
  description: string;
  keywords: string[];
  category: number;
  flags: StockFlags;
  /** true while the values still match what the AI produced */
  aiGenerated: boolean;
}

export interface PixelStats {
  /** normalized Laplacian variance, higher means sharper */
  sharpness: number;
  /** median high frequency energy, higher means noisier */
  noise: number;
  /** mean luminance 0..255 */
  exposure: number;
  /** share of pixels below 10 and above 245 */
  clipLow: number;
  clipHigh: number;
}

export type CheckLevel = 'pass' | 'warn' | 'fail';

export interface StockCheck {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
}

export interface StockReadiness {
  checks: StockCheck[];
  /** ready | notes | blocked */
  verdict: 'ready' | 'notes' | 'blocked';
  fails: number;
  warns: number;
}

/* --------------------------- pixel analysis ------------------------- */

/**
 * Measures sharpness, noise and exposure on a downscaled canvas copy of
 * the result. Pure heuristics tuned to flag what Adobe Stock reviewers
 * commonly reject: soft focus, heavy grain and crushed or clipped light.
 */
export async function measurePixels(url: string): Promise<PixelStats> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  try {
    const SIDE = 512;
    const ratio = Math.min(1, SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // grayscale plane
    const gray = new Float32Array(w * h);
    let sum = 0;
    let clipLow = 0;
    let clipHigh = 0;
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      gray[i] = l;
      sum += l;
      if (l < 10) clipLow++;
      if (l > 245) clipHigh++;
    }
    const n = w * h;
    const exposure = sum / n;

    // Laplacian response for every inner pixel
    const lap = new Float32Array(n);
    let lapAbsSum = 0;
    let lapSqSum = 0;
    let lapCount = 0;
    const hf: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v =
          4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        lap[i] = v;
        const a = Math.abs(v);
        lapAbsSum += a;
        lapSqSum += v * v;
        lapCount++;
        if (a < 40) hf.push(a); // flat-ish region responses approximate noise
      }
    }
    const meanAbs = lapAbsSum / Math.max(1, lapCount);
    const variance = lapSqSum / Math.max(1, lapCount) - meanAbs * meanAbs;
    // normalize by mean luminance so dark scenes are not judged soft
    const sharpness = variance / Math.max(16, exposure * exposure) * 100;

    hf.sort((a, b) => a - b);
    const noise = hf.length ? hf[Math.floor(hf.length * 0.9)] : 0;

    return {
      sharpness,
      noise,
      exposure,
      clipLow: clipLow / n,
      clipHigh: clipHigh / n,
    };
  } finally {
    bmp.close();
  }
}

/* ---------------------------- readiness ----------------------------- */

export function assessReadiness(
  item: QueueItem,
  stats: PixelStats | undefined
): StockReadiness {
  const checks: StockCheck[] = [];
  const r = item.result;
  const mp = r && r.w && r.h ? (r.w * r.h) / 1_000_000 : 0;

  if (mp > 0) {
    checks.push(
      mp < STOCK.minMP
        ? {
            id: 'mp',
            label: 'Resolution',
            level: 'fail',
            detail: `${mp.toFixed(1)} MP is below the 4 MP minimum. Pick a larger upscale.`,
          }
        : mp > STOCK.maxMP
          ? {
              id: 'mp',
              label: 'Resolution',
              level: 'fail',
              detail: `${mp.toFixed(1)} MP exceeds the 100 MP maximum.`,
            }
          : {
              id: 'mp',
              label: 'Resolution',
              level: 'pass',
              detail: `${mp.toFixed(1)} MP inside the 4 to 100 MP window.`,
            }
    );
  }

  if (r && r.size > 0) {
    const mb = r.size / (1024 * 1024);
    checks.push(
      mb > STOCK.maxFileMB
        ? {
            id: 'size',
            label: 'File size',
            level: 'fail',
            detail: `${mb.toFixed(1)} MB exceeds the 45 MB cap.`,
          }
        : {
            id: 'size',
            label: 'File size',
            level: 'pass',
            detail: `${mb.toFixed(1)} MB, cap is 45 MB.`,
          }
    );
    checks.push({
      id: 'format',
      label: 'Format',
      level: r.format === 'jpeg' ? 'pass' : 'warn',
      detail:
        r.format === 'jpeg'
          ? 'JPEG, the format Adobe Stock accepts.'
          : 'Export re encodes every file to submission JPEG.',
    });
  }

  if (stats) {
    checks.push(
      stats.sharpness < 0.8
        ? {
            id: 'sharp',
            label: 'Sharpness',
            level: 'warn',
            detail: 'Detail reads soft or the scene is very smooth, check focus at 100 percent.',
          }
        : stats.sharpness < 2.5
          ? {
              id: 'sharp',
              label: 'Sharpness',
              level: 'pass',
              detail: 'Moderate detail energy.',
            }
          : { id: 'sharp', label: 'Sharpness', level: 'pass', detail: 'Crisp edge energy.' }
    );

    checks.push(
      stats.noise > 14
        ? {
            id: 'noise',
            label: 'Noise',
            level: 'warn',
            detail: 'Heavy grain detected, denoise before submitting.',
          }
        : { id: 'noise', label: 'Noise', level: 'pass', detail: 'Grain under control.' }
    );

    const clipped = stats.clipLow + stats.clipHigh;
    checks.push(
      clipped > 0.08
        ? {
            id: 'exposure',
            label: 'Exposure',
            level: 'fail',
            detail: `${Math.round(clipped * 100)} percent of pixels are crushed or clipped.`,
          }
        : stats.exposure < 35 || stats.exposure > 225
          ? {
              id: 'exposure',
              label: 'Exposure',
              level: 'warn',
              detail: 'Very dark or very bright overall, check white balance.',
            }
          : { id: 'exposure', label: 'Exposure', level: 'pass', detail: 'Balanced histogram.' }
    );
  }

  const meta = item.meta;
  if (meta) {
    checks.push(
      meta.title.trim().length < 10
        ? {
            id: 'title',
            label: 'Title',
            level: 'fail',
            detail: 'Title needs at least 10 descriptive characters.',
          }
        : meta.title.length > STOCK.titleRecommended
          ? {
              id: 'title',
              label: 'Title',
              level: 'warn',
              detail: `${meta.title.length} characters, Adobe recommends ${STOCK.titleRecommended} or fewer.`,
            }
          : { id: 'title', label: 'Title', level: 'pass', detail: `${meta.title.length} characters.` }
    );

    checks.push(
      meta.keywords.length < STOCK.keywordsRecommended
        ? {
            id: 'keywords',
            label: 'Keywords',
            level: 'warn',
            detail: `${meta.keywords.length} keywords, aim for at least ${STOCK.keywordsRecommended}.`,
          }
        : {
            id: 'keywords',
            label: 'Keywords',
            level: 'pass',
            detail: `${meta.keywords.length} keywords, first ten carry the most weight.`,
          }
    );

    checks.push(
      meta.category === 0
        ? {
            id: 'category',
            label: 'Category',
            level: 'warn',
            detail: 'No category selected, one of the 21 helps search.',
          }
        : {
            id: 'category',
            label: 'Category',
            level: 'pass',
            detail: categoryName(meta.category),
          }
    );

    const flagMessages: [keyof StockFlags, string][] = [
      ['watermark', 'Watermark or stamp visible, Adobe will reject it.'],
      ['textOverlay', 'Readable text overlay, only acceptable when intentional.'],
      ['border', 'Border or frame visible, crop it off.'],
      ['logo', 'Recognizable logo, needs a property release or removal.'],
      ['aiArtifacts', 'Possible generative artifacts, inspect hands and text.'],
    ];
    for (const [key, message] of flagMessages) {
      if (meta.flags[key]) {
        checks.push({ id: key, label: 'Content', level: 'fail', detail: message });
      }
    }
  }

  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  return { checks, verdict: fails > 0 ? 'blocked' : warns > 0 ? 'notes' : 'ready', fails, warns };
}

/* ------------------------------ export ------------------------------ */

export function slugify(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image'
  );
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvRow {
  filename: string;
  title: string;
  keywords: string[];
  category: number;
}

/** Adobe Stock bulk metadata CSV: Filename, Title, Keywords, Category, Releases. */
export function buildStockCsv(rows: CsvRow[]): string {
  const header = 'Filename,Title,Keywords,Category,Releases';
  const lines = rows.map((r) =>
    [
      csvField(r.filename),
      csvField(r.title),
      csvField(r.keywords.join(', ')),
      r.category > 0 ? String(r.category) : '',
      '',
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

export const STOCK_README = [
  'Adobe Stock submission package',
  '',
  '1. Upload every file from the images folder to Adobe Stock.',
  '2. In the uploader choose Metadata CSV and pick adobe-stock-metadata.csv.',
  '3. Review titles and keywords, then submit for review.',
  '',
  'JPEG files are re encoded at 93 percent quality inside the 45 MB cap.',
  'Images enhanced with the GLM engine are generative AI modifications:',
  'mark them as Generative AI in the Adobe Stock uploader.',
  '',
  'Prepared with StockPrep.',
].join('\n');

/** Draws any decodable image blob to a submission ready JPEG. */
export async function toJpegBlob(url: string, quality = 0.93): Promise<Blob> {
  const src = await (await fetch(url)).blob();
  if (src.type === 'image/jpeg') return src;
  const bmp = await createImageBitmap(src);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', quality)
    );
    if (!out) throw new Error('JPEG encoding failed');
    return out;
  } finally {
    bmp.close();
  }
}

/** Downscaled JPEG proxy for the analyze endpoint. */
export async function makeAnalyzeProxy(url: string, maxSide = 1024): Promise<Blob> {
  const src = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(src);
  try {
    const ratio = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.85)
    );
    if (!out) throw new Error('Proxy encoding failed');
    return out;
  } finally {
    bmp.close();
  }
}
