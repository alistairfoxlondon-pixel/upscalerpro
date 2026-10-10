'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exportAdobePackage, useStore } from '@/lib/upscaler/store';
import { assessReadiness } from '@/lib/upscaler/stock';
import { MaterialIcon } from './material-icon';
import { cn } from '@/lib/utils';

/** Adobe Stock export summary + one click submission package. */
export function ExportPanel() {
  const items = useStore((s) => s.items);
  const [busy, setBusy] = React.useState(false);

  const done = items.filter((i) => i.status === 'done' && i.result && i.zip !== false);
  const ready = done.filter((i) => assessReadiness(i, i.stats).verdict === 'ready');
  const notes = done.filter((i) => assessReadiness(i, i.stats).verdict === 'notes');
  const blocked = done.filter((i) => assessReadiness(i, i.stats).verdict === 'blocked');
  const withMeta = done.filter((i) => i.meta).length;
  const avgKeywords =
    withMeta > 0
      ? Math.round(
          done.reduce((a, i) => a + (i.meta?.keywords.length ?? 0), 0) / withMeta
        )
      : 0;

  if (!done.length) return null;

  const onExport = () => {
    setBusy(true);
    void exportAdobePackage().finally(() => setBusy(false));
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-1.5">
            <MaterialIcon name="new_releases" size={17} className="text-primary" />
            Adobe Stock export
          </span>
          <span className="font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
            {done.length} file{done.length > 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
          <dt className="text-muted-foreground">Ready</dt>
          <dd className="text-right font-mono text-emerald-600 dark:text-emerald-400">
            {ready.length}
          </dd>
          <dt className="text-muted-foreground">Minor notes</dt>
          <dd className="text-right font-mono text-amber-600 dark:text-amber-400">{notes.length}</dd>
          <dt className="text-muted-foreground">Needs fixes</dt>
          <dd
            className={cn(
              'text-right font-mono',
              blocked.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
            )}
          >
            {blocked.length}
          </dd>
          <dt className="text-muted-foreground">With metadata</dt>
          <dd className="text-right font-mono">
            {withMeta}/{done.length}
          </dd>
          {withMeta > 0 && (
            <>
              <dt className="text-muted-foreground">Avg keywords</dt>
              <dd className="text-right font-mono">{avgKeywords}</dd>
            </>
          )}
        </dl>

        <Button className="w-full gap-1.5 rounded-md" onClick={onExport} disabled={busy}>
          <MaterialIcon name={busy ? 'progress_activity' : 'archive'} size={16} className={busy ? 'pf-spin' : ''} />
          {busy ? 'Packing…' : 'Export submission ZIP'}
        </Button>
        <p className="text-[10px] leading-snug text-muted-foreground">
          JPEG files at 93 percent quality, the metadata CSV for bulk upload and a short
          README, nothing is stored on the server after download.
        </p>
      </CardContent>
    </Card>
  );
}
