import { MaterialIcon } from './material-icon';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-secondary/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <MaterialIcon name="new_releases" filled size={18} className="text-primary" />
              StockPrep
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Free Adobe Stock prep studio. Quality first.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-foreground">Product</p>
            <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
              <a href="#tool" className="w-fit transition-colors hover:text-foreground">
                Prep studio
              </a>
              <a
                href="https://github.com/alistairfoxlondon-pixel/upscalerpro"
                target="_blank"
                rel="noreferrer noopener"
                className="w-fit transition-colors hover:text-foreground"
              >
                GitHub repository
              </a>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-foreground">Privacy</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Files are processed in memory and never stored. Closing the tab erases everything.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} StockPrep. MIT licensed.</p>
          <p className="flex items-center gap-1">
            Powered by GLM, Real-ESRGAN and libvips
          </p>
        </div>
      </div>
    </footer>
  );
}
