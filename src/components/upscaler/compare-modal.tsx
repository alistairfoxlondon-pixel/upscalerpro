'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CompareSlider } from './compare-slider';
import { PRESETS } from '@/lib/upscaler/registry';
import { downloadBlob, resultFilename, useStore } from '@/lib/upscaler/store';
import { formatBytes, formatDuration } from '@/lib/upscaler/utils';

export function CompareModal() {
  const compareId = useStore((s) => s.compareId);
  const setCompare = useStore((s) => s.setCompare);
  const items = useStore((s) => s.items);
  const item =
    items.find((i) => i.id === compareId && i.status === 'done' && i.result) ?? null;
  const r = item?.result ?? null;

  const onDownload = async () => {
    if (!item || !r) return;
    const blob = await (await fetch(r.url)).blob();
    downloadBlob(blob, resultFilename(item.name, r.scale, r.format));
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && setCompare(null)}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-4 sm:p-6">
        {item && r && (
          <>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="truncate pr-6 text-base sm:text-lg">
                {item.name}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>
                  {item.w}×{item.h} →{' '}
                  <span className="font-medium text-foreground">
                    {r.w}×{r.h}
                  </span>
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {r.scale}× · {PRESETS[r.preset].model}
                </Badge>
                <span>{formatDuration(r.ms)}</span>
                <span>
                  {formatBytes(item.sizeIn)} → {formatBytes(r.size)}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              <CompareSlider
                beforeSrc={item.originalUrl}
                afterSrc={r.url}
                aspect={r.w / r.h}
                afterLabel={`${r.scale}× upscaled`}
                className="max-h-[56vh]"
              />
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Drag the handle to compare · scroll to zoom · drag to pan when zoomed · or open full size for 1:1 pixels
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => window.open(r.url, '_blank', 'noopener')}
              >
                Open full size
              </Button>
              <Button onClick={() => void onDownload()}>
                <Download className="h-4 w-4" aria-hidden />
                Download {r.format.toUpperCase()}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
