import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import ZAI from 'z-ai-web-dev-sdk';
import { MAX_INPUT_BYTES } from '@/lib/upscaler/engine';

/**
 * POST multipart/form-data:
 *   file   image (a downscaled proxy is enough, VLM reads content not pixels)
 *
 * Returns Adobe Stock oriented metadata generated from the image content:
 *   title       <= 200 chars, Adobe Stock style descriptive sentence
 *   description one sentence
 *   keywords    up to 49, most important first, lowercase
 *   category    one of the 21 official Adobe Stock categories (1..21)
 *   flags       visible content risks Adobe Stock reviewers reject
 *
 * The image is analyzed in memory and never stored.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ANALYZE_SIDE = 1024;

const SYSTEM_PROMPT = `You are a senior Adobe Stock metadata specialist and reviewer.
Look at the image and reply with ONLY minified JSON, no markdown, no code fences:
{"title":"...","description":"...","keywords":["..."],"category":N,"flags":{"watermark":false,"textOverlay":false,"border":false,"logo":false,"aiArtifacts":false}}
Rules:
- title: 40 to 70 characters, natural descriptive phrase in English, first word capitalized, no punctuation at the end, no keyword lists, no brand names, no camera jargon
- description: one sentence up to 150 characters summarizing the image
- keywords: exactly 30 to 49 items, single words or short lowercase phrases, ordered from most to least important for buyer searches, no duplicates, no brand names, no single letters
- category: one integer from the official Adobe Stock category list: 1 Animals, 2 Buildings and Architecture, 3 Business, 4 Drinks, 5 The Environment, 6 States of Mind, 7 Food, 8 Graphic Resources, 9 Hobbies and Leisure, 10 Industry, 11 Landscapes, 12 Lifestyle, 13 People, 14 Plants and Flowers, 15 Culture and Religion, 16 Science, 17 Social Issues, 18 Sports, 19 Technology, 20 Transport, 21 Travel
- flags: set true only when clearly visible in the image: watermark (any watermark or sample stamp), textOverlay (readable text rendered into the scene), border (frame or solid border around the image), logo (recognizable brand logo), aiArtifacts (warped hands, melted text, impossible geometry)`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function extractJson(raw: string): Record<string, unknown> | null {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanKeywords(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const k = String(item ?? '')
      .toLowerCase()
      .replace(/["\u201c\u201d]/g, '')
      .trim()
      .slice(0, 40);
    if (k.length >= 2 && k.length <= 40 && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
    if (out.length >= 49) break;
  }
  return out;
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
    return jsonError('Image is too large', 413);
  }

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const proxy = await sharp(input, { failOn: 'none', limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: ANALYZE_SIDE, height: ANALYZE_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    const meta = await sharp(proxy).metadata();
    if (!meta.width || !meta.height) return jsonError('Could not read the image', 400);

    const zai = await ZAI.create();
    const dataUrl = `data:image/jpeg;base64,${proxy.toString('base64')}`;

    const completion = await Promise.race([
      zai.chat.completions.createVision({
        model: 'glm-4.6v',
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Generate Adobe Stock metadata for this image. Reply with the JSON object only.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Analysis timed out')), 48_000)),
    ]);

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = extractJson(raw);
    if (!parsed) return jsonError('The AI response could not be parsed', 502);

    const title = String(parsed.title ?? '').slice(0, 200).trim();
    const description = String(parsed.description ?? '').slice(0, 200).trim();
    const keywords = cleanKeywords(parsed.keywords);
    const categoryNum = Number(parsed.category);
    const category =
      Number.isInteger(categoryNum) && categoryNum >= 1 && categoryNum <= 21 ? categoryNum : 0;
    const flagsRaw = (parsed.flags ?? {}) as Record<string, unknown>;
    const bool = (v: unknown) => v === true;
    const flags = {
      watermark: bool(flagsRaw.watermark),
      textOverlay: bool(flagsRaw.textOverlay),
      border: bool(flagsRaw.border),
      logo: bool(flagsRaw.logo),
      aiArtifacts: bool(flagsRaw.aiArtifacts),
    };
    if (!title || keywords.length < 5) {
      return jsonError('The AI response was incomplete', 502);
    }

    return NextResponse.json(
      { title, description, keywords, category, flags },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    if (/timed out/i.test(message)) return jsonError('The AI took too long, try again', 504);
    if (/input file missing|unsupported image format/i.test(message)) {
      return jsonError('Unsupported or corrupted image', 415);
    }
    console.error('[analyze]', message);
    return jsonError(message.slice(0, 180), 500);
  }
}
