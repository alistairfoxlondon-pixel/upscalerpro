'use client';

import { motion } from 'framer-motion';
import { Lock, Images, FileArchive, Cpu } from 'lucide-react';

const chips = [
  { icon: Lock, text: 'Images never leave your device' },
  { icon: Cpu, text: 'WebGL neural engine' },
  { icon: Images, text: 'JPEG · PNG · WebP · AVIF · HEIC · TIFF' },
  { icon: FileArchive, text: 'Batch + ZIP export' },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      {/* backdrop glow + grid + drifting orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="pf-orb absolute left-[12%] top-[-160px] h-[360px] w-[360px] rounded-full bg-primary/15 blur-[110px] dark:bg-primary/20" />
        <div className="pf-orb pf-orb-slow absolute right-[8%] top-[40px] h-[300px] w-[300px] rounded-full bg-teal-500/10 blur-[100px] dark:bg-teal-400/10" />
        <div className="absolute left-1/2 top-[-220px] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] dark:bg-primary/25" />
        <div className="bg-grid absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)] dark:opacity-20" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-14 text-center sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mx-auto max-w-3xl"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/40">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            100% local · free · no sign-up
          </div>

          <h1
            id="hero-title"
            className="text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl"
          >
            Upscale images to{' '}
            <span className="pf-shimmer bg-gradient-to-r from-primary via-emerald-400 to-teal-300 bg-clip-text text-transparent">
              crystal clarity
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Fix blurry, pixelated photos with on-device AI super-resolution.
            Pick a scale, drop your files — up to 8× sharper in seconds, right in your browser.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {chips.map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                {text}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
