import { Sparkles, ShieldCheck } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:text-left">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-3 w-3" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight">
            Pixel<span className="text-primary">Forge</span>
          </span>
          <span className="text-muted-foreground">— free open-source AI image upscaler</span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
          No uploads · No accounts · No tracking · Works offline
        </p>
      </div>
    </footer>
  );
}
