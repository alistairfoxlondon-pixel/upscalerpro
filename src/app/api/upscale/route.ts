import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/**
 * PixelForge server side upscaler.
 *
 * POST multipart/form-data:
 *   file      image (jpeg, png, webp, gif, avif, tiff, heic*)
 *   scale     2 | 3 | 4 | 8            (factor mode)
 *   target    px longest side          (target mode, overrides scale)
 *   denoise   0 | 1 | 2                (median filter off / light / strong)
 *   sharpen   0 | 1                    (unsharp mask after upscale)
 *   format    jpeg | png | webp
 *   quality   0.5..1                   (jpeg / webp)
 *   exif      0 | 1                    (keep metadata in jpeg output)
 *
 * Everything runs in memory. Nothing is written to disk, so nothing needs
 * deleting: the file is gone the moment the response is sent.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_INPUT_PIXELS = 30_000_000;
const MAX_INPUT_SIDE = 8192;
const MAX_INPUT_BYTES = 26 * 1024 * 1024;
const MAX_OUT_SIDE = 8192;
const MAX_OUT_PIXELS = 34_000_000;
const SCALES = [2, 3, 4, 8] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Split an upscale factor into <=2x lanczos passes for cleaner large steps. */
function stepsFor(factor: number): number[] {
  const steps: number[] = [];
  let remaining = factor;
  while (remaining > 2.0001) {
    steps.push(2);
    remaining /= 2;
  }
  if (remaining > 1.0001) steps.push(remaining);
  return steps.length ? steps : [1];
}

/** Cumulative factor up to step i. */
function cumulative(steps: number[], i: number): number {
  let k = 1;
  for (let s = 0; s <= i; s++) k *= steps[s];
  return k;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Invalid form data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("No image received", 400);
  }
  if (file.size > MAX_INPUT_BYTES) {
    return jsonError("Image is too large (max 26 MB)", 413);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const rawScale = Number(form.get("scale"));
  const rawTarget = Number(form.get("target"));
  const denoise = clamp(Number(form.get("denoise")) || 0, 0, 2);
  const doSharpen = form.get("sharpen") === "1";
  const rawFormat = String(form.get("format") || "png");
  const format = (["jpeg", "png", "webp"].includes(rawFormat) ? rawFormat : "png") as
    | "jpeg"
    | "png"
    | "webp";
  const quality = clamp(Number(form.get("quality")) || 0.92, 0.5, 1);
  const keepExif = form.get("exif") === "1";
  const hasTarget = Number.isFinite(rawTarget) && rawTarget >= 16;
  const scale = (SCALES.includes(rawScale as (typeof SCALES)[number]) ? rawScale : 2) as 2 | 3 | 4 | 8;

  const started = Date.now();
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    let w = meta.width ?? 0;
    let h = meta.height ?? 0;
    const orientation = meta.orientation ?? 1;
    if (orientation >= 5) [w, h] = [h, w]; // rotate() swaps the axes
    if (!w || !h) return jsonError("Could not read image dimensions", 400);
    if (Math.max(w, h) > MAX_INPUT_SIDE) return jsonError("Image is too large (max 8192 px per side)", 413);
    if (w * h > MAX_INPUT_PIXELS) return jsonError("Image is too large (max 30 MP)", 413);

    // plan the output size (server enforces the same caps the client checks)
    let outW: number;
    let outH: number;
    if (hasTarget) {
      const k = rawTarget / Math.max(w, h);
      if (k <= 0.02) return jsonError("Target size is too small", 400);
      outW = Math.max(1, Math.round(w * k));
      outH = Math.max(1, Math.round(h * k));
    } else {
      // largest scale that fits inside the output caps
      let s = 2;
      for (const cand of SCALES) {
        if (cand > scale) break;
        if (w * cand <= MAX_OUT_SIDE && h * cand <= MAX_OUT_SIDE && w * cand * h * cand <= MAX_OUT_PIXELS) {
          s = cand as 2 | 3 | 4 | 8;
        }
      }
      outW = w * s;
      outH = h * s;
    }
    if (Math.max(outW, outH) > MAX_OUT_SIDE || outW * outH > MAX_OUT_PIXELS) {
      return jsonError("Output size exceeds the 8192 px / 34 MP limit", 413);
    }

    let img = sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    if (denoise > 0) img = img.median(denoise === 2 ? 5 : 3);

    // Upscale in <=2x lanczos passes (cleaner big steps, mild sharpen between
    // passes when requested). Downscale and exact targets resize in one pass.
    const factor = Math.max(w, h) > 0 ? Math.max(outW, outH) / Math.max(w, h) : 1;
    if (factor > 1.02) {
      const steps = stepsFor(factor);
      for (let i = 0; i < steps.length; i++) {
        const isLast = i === steps.length - 1;
        const stepW = isLast ? outW : Math.min(outW, Math.round(w * cumulative(steps, i)));
        const stepH = isLast ? outH : Math.min(outH, Math.round(h * cumulative(steps, i)));
        img = img.resize({
          width: Math.max(1, stepW),
          height: Math.max(1, stepH),
          kernel: "lanczos3",
          fit: "fill",
        });
        if (isLast) break;
        if (doSharpen) img = img.sharpen({ sigma: 0.7 });
        const buf = await img.toBuffer();
        img = sharp(buf, { limitInputPixels: MAX_OUT_PIXELS * 4 });
      }
    } else {
      img = img.resize({
        width: outW,
        height: outH,
        kernel: "lanczos3",
        fit: "fill",
      });
    }

    if (doSharpen) img = img.sharpen({ sigma: 1, m1: 0.4, m2: 0.6 });

    // encode
    if (format === "jpeg") {
      img = img.flatten({ background: "#ffffff" }).jpeg({ quality: Math.round(quality * 100), mozjpeg: true });
      if (keepExif) {
        // orientation is already baked into the pixels by rotate(), so the
        // stored tag must be reset or viewers would rotate a second time
        img = img.keepExif().withExifMerge({ IFD0: { Orientation: "1" } });
      }
    } else if (format === "webp") {
      img = img.webp({ quality: Math.round(quality * 100), effort: 4 });
    } else {
      img = img.png({ compressionLevel: 9 });
    }

    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    const ms = Date.now() - started;

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": `image/${format}`,
        "Content-Length": String(data.length),
        "X-Image-Width": String(info.width ?? outW),
        "X-Image-Height": String(info.height ?? outH),
        "X-Process-Ms": String(ms),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    if (/input file missing|unsupported image format/i.test(message)) {
      return jsonError("Unsupported or corrupted image", 415);
    }
    return jsonError(message.slice(0, 180), 500);
  }
}
