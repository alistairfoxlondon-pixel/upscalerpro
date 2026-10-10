/**
 * GLM AI enhancement engine (server side only).
 *
 * Uses the GLM image editing model through z-ai-web-dev-sdk to regenerate
 * the picture with more detail, less noise and better clarity. The model
 * only produces a fixed set of sizes, so the input is first matched to the
 * closest supported aspect ratio and the answer is resized back to the
 * exact requested output. Both resamples use fit fill, so the horizontal
 * and vertical stretches cancel out and the composition keeps the input
 * aspect ratio.
 *
 * Because pixels are regenerated, submissions made with this engine should
 * be declared as generative AI content inside Adobe Stock.
 *
 * Nothing is written to disk. Buffers live only for the duration of the
 * request.
 */
import sharp from 'sharp';
import ZAI from 'z-ai-web-dev-sdk';
import type { UpscaleParams, UpscaleOutcome } from './engine';
import { MAX_INPUT_PIXELS } from './engine';

/** Sizes the GLM image edit endpoint can return. */
export type GlmSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';

export const GLM_SIZES: { w: number; h: number; id: GlmSize }[] = [
  { w: 1024, h: 1024, id: '1024x1024' }, // square
  { w: 1344, h: 768, id: '1344x768' }, // 7:4 landscape
  { w: 1152, h: 864, id: '1152x864' }, // 4:3 landscape
  { w: 1440, h: 720, id: '1440x720' }, // 2:1 wide
  { w: 864, h: 1152, id: '864x1152' }, // 3:4 portrait
  { w: 768, h: 1344, id: '768x1344' }, // 4:7 portrait
  { w: 720, h: 1440, id: '720x1440' }, // 1:2 tall
];

const ENHANCE_PROMPT =
  'Enhance this photo to professional stock photography quality: ' +
  'increase resolution, sharpness and clarity, restore fine texture and ' +
  'detail, remove noise and compression artifacts, refine exposure and ' +
  'color balance subtly. Keep the composition, framing, subject, colors ' +
  'and every element exactly identical to the input image. Photorealistic, ' +
  'natural look, no added text, no watermarks, no borders.';

function pickSize(w: number, h: number): { w: number; h: number; id: GlmSize } {
  const r = w / h;
  let best = GLM_SIZES[0];
  let bestDiff = Infinity;
  for (const s of GLM_SIZES) {
    const diff = Math.abs(s.w / s.h - r);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

/** Hard stop so a slow model call can never hang a serverless function. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);
}

/**
 * Regenerates the image through GLM at the closest supported size, then
 * resamples to the exact output size and encodes it with the shared
 * encoder settings.
 */
export async function upscaleGlm(
  input: Buffer,
  p: UpscaleParams,
  encode: (img: sharp.Sharp, p: UpscaleParams) => Promise<Buffer>
): Promise<UpscaleOutcome> {
  const size = pickSize(p.inW, p.inH);

  // 1. pre resize to the supported canvas so stretches cancel later
  const feed = await sharp(input, { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .removeAlpha()
    .resize({ width: size.w, height: size.h, kernel: 'lanczos3', fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer();

  // 2. ask GLM to enhance
  // the SDK type still declares the old single image field, the live
  // endpoint takes the documented images array
  const zai = await ZAI.create();
  const dataUrl = `data:image/jpeg;base64,${feed.toString('base64')}`;
  const editBody = {
    prompt: ENHANCE_PROMPT,
    images: [{ url: dataUrl }],
    size: size.id,
  } as unknown as Parameters<typeof zai.images.generations.edit>[0];
  const res = (await withTimeout(
    zai.images.generations.edit(editBody),
    50_000,
    'GLM enhancement'
  )) as { data?: { base64?: string }[] };

  const b64 = res?.data?.[0]?.base64;
  if (!b64) throw new Error('GLM enhancement returned no image');

  // 3. decode and resize to the exact requested output
  const generated = Buffer.from(b64, 'base64');
  let img = sharp(generated, { failOn: 'none' }).resize({
    width: p.outW,
    height: p.outH,
    kernel: 'lanczos3',
    fit: 'fill',
  });
  if (p.sharpen) {
    img = img.sharpen({ sigma: 0.5, m1: 0, m2: 0.4, x1: 2, y2: 1.2, y3: 1.8 });
  }
  const data = await encode(img.flatten({ background: '#ffffff' }), p);
  return { data, width: p.outW, height: p.outH, format: p.format, aiTiles: 0 };
}
