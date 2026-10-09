'use client';

import * as React from 'react';
import { useStore } from '@/lib/upscaler/store';
import { Dropzone } from './dropzone';
import { SettingsPanel } from './settings-panel';
import { Queue } from './queue';
import { CompareModal } from './compare-modal';
import { formatMP } from '@/lib/upscaler/utils';

export function Workspace() {
  const items = useStore((s) => s.items);
  const totals = useStore((s) => s.totals);
  const hasItems = items.length > 0;

  return (
    <section id="workspace" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-16" aria-label="Upscaler workspace">
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-20">
          <SettingsPanel />
          {totals.images > 0 && (
            <div className="rounded-xl border bg-card/60 p-4 text-xs text-muted-foreground">
              <p className="mb-2 text-sm font-semibold text-foreground">Session</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 tabular-nums">
                <dt>Images upscaled</dt>
                <dd className="text-right font-mono text-foreground">{totals.images}</dd>
                <dt>Pixels generated</dt>
                <dd className="text-right font-mono text-foreground">
                  {formatMP(Math.max(0, totals.pixelsOut - totals.pixelsIn))}
                </dd>
                <dt>Data in / out</dt>
                <dd className="text-right font-mono text-foreground">
                  {formatBytes(totals.bytesIn, 0)} → {formatBytes(totals.bytesOut, 0)}
                </dd>
              </dl>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Dropzone />
          {hasItems && <Queue />}
        </div>
      </div>

      <CompareModal />
    </section>
  );
}

function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}
