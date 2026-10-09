'use client';

import { Sparkles, Github } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <a href="#top" className="flex items-center gap-2.5" aria-label="PixelForge home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight">
            Pixel<span className="text-primary">Forge</span>
          </span>
          <Badge variant="secondary" className="ml-1 hidden text-[10px] font-medium uppercase tracking-wide sm:inline-flex">
            Open Source
          </Badge>
        </a>
        <nav className="flex items-center gap-1" aria-label="Site">
          <a
            href="https://github.com/thekevinscott/upscalerjs"
            target="_blank"
            rel="noreferrer noopener"
            className="hidden sm:block"
            aria-label="View the open-source engine on GitHub"
          >
            <Button variant="ghost" size="sm" className="h-9 gap-2 text-muted-foreground">
              <Github className="h-4 w-4" aria-hidden />
              <span className="text-xs">Engine</span>
            </Button>
          </a>
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1 h-9">
            <a href="#workspace">Upscale now</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
