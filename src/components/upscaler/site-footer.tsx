import { Sparkles } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-center sm:flex-row sm:text-left">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Sparkles className="h-3 w-3" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight">
            Pixel<span className="text-primary">Forge</span>
          </span>
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            MIT
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Images are processed in memory and deleted right after.
        </p>
      </div>
    </footer>
  );
}
