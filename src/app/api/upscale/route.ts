import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  upscaleBuffer,
  encodeImg,
  MAX_INPUT_PIXELS,
  MAX_INPUT_SIDE,
  MAX_INPUT_BYTES,
  MAX_OUT_SIDE,
  MAX_OUT_PIXELS,
  AI_INPUT_MAX_SIDE,
} from '@/lib/upscaler/engine';
import { upscaleGlm } from '@/lib/upscaler/glm';

/**
 * POST multipart/form-data:
 *   file      image
 *   engine    standard | ai | glm     (Real-ESRGAN x4 v3 / GLM generative)
 *   scale     2 | 3 | 4 | 8           (factor mode)
 *   target    px longest side         (target mode, overrides scale)
 *   denoise   0 | 1 | 2               (standard engine)
 *   sharpen   0 | 1
 *   format    jpeg | png | webp
 *   quality   0.5..1                  (jpeg / webp)
 *   exif      0 | 1                   (standard engine, jpeg output)
 *
 * The response always reports what was actually applied in X-Applied-*
 * headers so the UI can show honest feedback instead of guesses.
 *
 * Everything runs in memory. Nothing is written to disk and nothing is
 * stored after the response: the file is gone the moment it is sent.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SCALES = [2, 3, 4, 8] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('Invalid form data', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return jsonError('No image received', 400);
  }
  if (file.size > MAX_INPUT_BYTES) {
    return jsonError('Image is too large (max 26 MB)', 413);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const engineRaw = String(form.get('engine') || 'standard');
  const engine: 'standard' | 'ai' | 'glm' =
    engineRaw === 'ai' ? 'ai' : engineRaw === 'glm' ? 'glm' : 'standard';
  const rawScale = Number(form.get('scale'));
  const rawTarget = Number(form.get('target'));
  const denoise = clamp(Number(form.get('denoise')) || 0, 0, 2) as 0 | 1 | 2;
  const doSharpen = form.get('sharpen') === '1';
  const rawFormat = String(form.get('format') || 'png');
  const format = (['jpeg', 'png', 'webp'].includes(rawFormat) ? rawFormat : 'png') as
    | 'jpeg'
    | 'png'
    | 'webp';
  const quality = clamp(Number(form.get('quality')) || 0.92, 0.5, 1);
  const keepExif = form.get('exif') === '1';
  const hasTarget = Number.isFinite(rawTarget) && rawTarget >= 16;
  const scale = (SCALES.includes(rawScale as (typeof SCALES)[number])
    ? rawScale
    : 2) as (typeof SCALES)[number];

  const started = Date.now();
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    let w = meta.width ?? 0;
    let h = meta.height ?? 0;
    const orientation = meta.orientation ?? 1;
    if (orientation >= 5) [w, h] = [h, w]; // rotate() swaps the axes
    if (!w || !h) return jsonError('Could not read image dimensions', 400);
    if (Math.max(w, h) > MAX_INPUT_SIDE) return jsonError('Image is too large (max 8192 px per side)', 413);
    if (w * h > MAX_INPUT_PIXELS) return jsonError('Image is too large (max 30 MP)', 413);

    // AI engine input budget: larger photos fall back to standard with a
    // clear notice instead of a mysterious timeout. GLM always works: the
    // input is pre resized to the supported canvas before generation.
    let appliedEngine = engine;
    let aiFallback = false;
    if (engine === 'ai' && Math.max(w, h) > AI_INPUT_MAX_SIDE) {
      appliedEngine = 'standard';
      aiFallback = true;
    }

    // plan the output size
    let outW: number;
    let outH: number;
    let appliedScale = scale;
    let capped = false;
    if (hasTarget) {
      const k = rawTarget / Math.max(w, h);
      if (k <= 0.02) return jsonError('Target size is too small', 400);
      outW = Math.max(1, Math.round(w * k));
      outH = Math.max(1, Math.round(h * k));
      appliedScale = (Math.max(1, Math.round(k)) || 1) as (typeof SCALES)[number];
    } else {
      // honor the requested scale exactly when it fits, else pick the
      // largest that fits and flag it so the UI can tell the user
      let s: (typeof SCALES)[number] = 2;
      for (const cand of SCALES) {
        if (cand > scale) break;
        if (w * cand <= MAX_OUT_SIDE && h * cand <= MAX_OUT_SIDE && w * cand * h * cand <= MAX_OUT_PIXELS) {
          s = cand as (typeof SCALES)[number];
        }
      }
      if (s !== scale) capped = true;
      appliedScale = s;
      outW = w * s;
      outH = h * s;
    }
    if (Math.max(outW, outH) > MAX_OUT_SIDE || outW * outH > MAX_OUT_PIXELS) {
      return jsonError('Output size exceeds the 8192 px / 34 MP limit', 413);
    }

    const meta2 = await sharp(input, { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const hasAlpha = !!meta2.hasAlpha;

    const params = {
      engine: appliedEngine === 'glm' ? 'ai' : appliedEngine,
      outW,
      outH,
      inW: w,
      inH: h,
      denoise,
      sharpen: doSharpen,
      format,
      quality,
      keepExif,
      hasAlpha,
    };
    const outcome =
      appliedEngine === 'glm'
        ? await upscaleGlm(input, params, encodeImg)
        : await upscaleBuffer(input, params);

    const ms = Date.now() - started;
    return new NextResponse(new Uint8Array(outcome.data), {
      status: 200,
      headers: {
        'Content-Type': `image/${format}`,
        'Content-Length': String(outcome.data.length),
        'X-Image-Width': String(outcome.width),
        'X-Image-Height': String(outcome.height),
        'X-Process-Ms': String(ms),
        'X-Applied-Engine': appliedEngine,
        'X-Applied-Scale': String(appliedScale),
        'X-Applied-Format': format,
        'X-Applied-Sharpen': doSharpen ? '1' : '0',
        'X-Ai-Tiles': String(outcome.aiTiles),
        'X-Capped': capped ? '1' : '0',
        'X-Ai-Fallback': aiFallback ? '1' : '0',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    if (/input file missing|unsupported image format/i.test(message)) {
      return jsonError('Unsupported or corrupted image', 415);
    }
    console.error('[upscale]', message);
    return jsonError(message.slice(0, 180), 500);
  }
}
