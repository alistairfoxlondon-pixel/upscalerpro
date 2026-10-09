'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Layers, Wand2 } from 'lucide-react';

const features = [
  {
    icon: ShieldCheck,
    title: 'Truly private',
    body: 'Your photos are processed by your own GPU inside the browser tab. Nothing is ever uploaded, stored, or tracked.',
  },
  {
    icon: Zap,
    title: 'WebGL accelerated',
    body: 'TensorFlow.js runs ESRGAN super-resolution on your GPU — with smart tiling so even big images fit in memory.',
  },
  {
    icon: Layers,
    title: 'Batch friendly',
    body: 'Queue up to 50 images at once, compare results side-by-side, and export everything in a single ZIP.',
  },
  {
    icon: Wand2,
    title: 'Open-source models',
    body: 'Powered by ESRGAN (MIT) via UpscalerJS and TensorFlow.js. No accounts, no limits, no watermarks — ever.',
  },
];

export function Features() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-16" aria-labelledby="features-title">
      <div className="mb-8 text-center">
        <div className="mb-3 flex items-center justify-center gap-3" aria-hidden>
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-border" />
          <span className="rounded-full border border-border/60 bg-card/60 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Why PixelForge
          </span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-border" />
        </div>
        <h2 id="features-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Cloud-quality upscaling,
          <br className="hidden sm:block" /> without the cloud
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The quality of a cloud upscaler, running entirely on your machine.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
            className="group rounded-2xl border bg-card/60 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
