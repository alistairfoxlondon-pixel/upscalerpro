'use client';

import { Github, Sparkles } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { InstallButton } from './install-button';
import { Button } from '@/components/ui/button';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <a href="#top" className="flex items-center gap-2" aria-label="PixelForge home">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight">
            Pixel<span className="text-primary">Forge</span>
          </span>
        </a>
        <nav className="flex items-center gap-1" aria-label="Site">
          <a
            href="https://github.com/alistairfoxlondon-pixel/upscalerpro"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="View the project on GitHub"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Github className="h-4 w-4" aria-hidden />
          </a>
          <InstallButton />
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1 h-9">
            <a href="#workspace">Open app</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
