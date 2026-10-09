'use client';

import { Github, ExternalLink } from 'lucide-react';

const credits = [
  {
    name: 'UpscalerJS',
    role: 'ESRGAN super-resolution for JS',
    license: 'MIT',
    href: 'https://github.com/thekevinscott/upscaler',
  },
  {
    name: 'TensorFlow.js',
    role: 'GPU-accelerated ML runtime',
    license: 'Apache-2.0',
    href: 'https://github.com/tensorflow/tfjs',
  },
  {
    name: 'ESRGAN',
    role: 'Super-resolution architecture',
    license: 'Paper / models',
    href: 'https://github.com/xinntao/ESRGAN',
  },
  {
    name: 'Next.js',
    role: 'React framework',
    license: 'MIT',
    href: 'https://github.com/vercel/next.js',
  },
  {
    name: 'shadcn/ui',
    role: 'UI component system',
    license: 'MIT',
    href: 'https://github.com/shadcn-ui/ui',
  },
  {
    name: 'heic2any + UTIF',
    role: 'HEIC & TIFF decoding',
    license: 'MIT / GPL-3.0',
    href: 'https://github.com/utfredrik/utif.js',
  },
];

export function OssCredits() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16" aria-labelledby="oss-title">
      <div className="mb-8 text-center">
        <h2 id="oss-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Built on open source
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every layer of the stack is free, auditable and self-hostable.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {credits.map((c) => (
          <a
            key={c.name}
            href={c.href}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-center gap-3 rounded-xl border bg-card/60 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors group-hover:text-primary">
              <Github className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-medium">
                {c.name}
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </span>
              <span className="block truncate text-xs text-muted-foreground">{c.role}</span>
            </span>
            <span className="shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {c.license}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
