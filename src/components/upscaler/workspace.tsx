'use client';

import * as React from 'react';
import { useStore } from '@/lib/upscaler/store';
import { formatDuration } from '@/lib/upscaler/utils';
import { Dropzone } from './dropzone';
import { SettingsPanel } from './settings-panel';
import { Queue } from './queue';
import { CompareModal } from './compare-modal';
import { WindowDrop } from './window-drop';
import { KeyboardShortcuts } from './keyboard-shortcuts';

/** Smoothly animates a number toward its target value. */
function useCountUp(target: number, duration = 500): number {
  const [value, setValue] = React.useState(target);
  const fromRef = React.useRef(target);
  React.useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, duration]);
  return value;
}

function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

function formatMP(pixels: number): string {
  if (pixels >= 1_000_000) return `${(pixels / 1_000_000).toFixed(1)}MP`;
  if (pixels >= 1_000) return `${Math.round(pixels / 1000)}k px`;
  return `${Math.round(pixels)} px`;
}

export function Workspace() {
  const items = useStore((s) => s.items);
  const busy = useStore((s) => s.busy);
  const totals = useStore((s) => s.totals);
  const hasItems = items.length > 0;

  // restore persisted user settings after mount (avoids SSR mismatch)
  React.useEffect(() => {
    Promise.resolve(useStore.persist.rehydrate())
      .then(async () => {
        // bring back finished results from the previous session (IndexedDB)
        try {
          const restored = await useStore.getState().restorePersisted();
          if (restored > 0) {
            const { toast } = await import('sonner');
            toast.success(
              restored === 1 ? 'Restored 1 result' : `Restored ${restored} results`,
              { description: 'From your last visit — everything stayed on this device.' }
            );
          }
        } catch {
          /* persistence is best-effort */
        }
      })
      .catch(() => undefined);
  }, []);

  // guard against closing the tab mid-job (results are local-only)
  React.useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [busy]);

  const animatedImages = useCountUp(totals.images);
  const animatedPixels = useCountUp(totals.pixelsOut - totals.pixelsIn);

  return (
    <section
      id="workspace"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-16"
      aria-label="Upscaler workspace"
    >
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-20">
          <SettingsPanel />
          {totals.images > 0 && (
            <div className="rounded-xl border bg-card/60 p-4 text-xs text-muted-foreground shadow-sm">
              <p className="mb-2.5 flex items-center justify-between text-sm font-semibold text-foreground">
                Session
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                  local only
                </span>
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 tabular-nums">
                <dt>Images upscaled</dt>
                <dd className="text-right font-mono text-foreground">
                  {Math.round(animatedImages)}
                </dd>
                <dt>Pixels generated</dt>
                <dd className="text-right font-mono text-foreground">
                  {formatMP(Math.max(0, animatedPixels))}
                </dd>
                <dt>Data in / out</dt>
                <dd className="text-right font-mono text-foreground">
                  {formatBytes(totals.bytesIn, 0)} → {formatBytes(totals.bytesOut, 0)}
                </dd>
                <dt>Avg / image</dt>
                <dd className="text-right font-mono text-foreground">
                  {formatDuration(totals.ms / Math.max(1, totals.images))}
                </dd>
              </dl>
              <p className="mt-2.5 border-t border-border/50 pt-2 text-[10px] leading-relaxed text-muted-foreground/80">
                Finished results are kept in this browser and restored on your next visit.
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Dropzone />
          {hasItems && <Queue />}
        </div>
      </div>

      <CompareModal />
      <WindowDrop />
      <KeyboardShortcuts />
    </section>
  );
}
