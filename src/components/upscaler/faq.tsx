'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    q: 'Are my images uploaded anywhere?',
    a: 'No. Decoding, AI upscaling and encoding all happen locally in your browser using WebGL. There is no server API, no account, and no storage — you can even disconnect from the internet after the page loads (models are served from this site or cached) and keep working.',
  },
  {
    q: 'Which formats are supported?',
    a: 'Input: JPEG, PNG, WebP, AVIF, GIF, BMP, HEIC/HEIF (iPhone photos) and TIFF — plus anything your browser can decode. Output: your choice of JPEG, PNG or WebP, or “Auto” to keep the original format. Transparency is preserved for PNG/WebP.',
  },
  {
    q: 'Why is the first image slower?',
    a: 'The AI model is downloaded once (1–3 MB for Fast/Balanced) and compiled for your GPU, then reused for every image in the batch. Studio mode downloads ~29 MB of weights and is much slower — it is meant for small, precious images.',
  },
  {
    q: 'Is there a size limit?',
    a: 'Outputs are capped at 8192 px per side (~34 MP) to keep your device stable. If the chosen scale would exceed that, PixelForge automatically applies the largest safe scale and tells you — this also applies to 8×, which needs a small source image (roughly under 0.5 MP). Very large inputs (>40 MP) are rejected with a clear message.',
  },
  {
    q: 'How good is the quality compared to online tools?',
    a: 'PixelForge uses ESRGAN — the same family of open-source super-resolution models used by many desktop and cloud tools. Balanced mode gives excellent results on photos and game assets; Studio mode recovers the most detail at the cost of speed. The Enhance controls add a median noise-cleanup pre-pass and an unsharp-mask finishing pass for grainy or pixelated sources.',
  },
  {
    q: 'Does it remember my settings?',
    a: 'Yes — your engine, scale, format and enhance choices are stored locally in your browser (localStorage). Nothing about you or your images ever syncs anywhere.',
  },
];

export function Faq() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-16" aria-labelledby="faq-title">
      <div className="mb-8 text-center">
        <div className="mb-3 flex items-center justify-center gap-3" aria-hidden>
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-border" />
          <span className="rounded-full border border-border/60 bg-card/60 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            FAQ
          </span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-border" />
        </div>
        <h2 id="faq-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Frequently asked
        </h2>
      </div>
      <Accordion type="single" collapsible className="rounded-2xl border bg-card/60 px-4 shadow-sm">
        {faqs.map((f, i) => (
          <AccordionItem key={f.q} value={`faq-${i}`} className="last:border-b-0">
            <AccordionTrigger className="py-4 text-left text-sm font-medium">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
