'use client';

import * as React from 'react';
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
import { CompareSideBySide } from './compare-side';
import { downloadBlob, resultFilename, useStore } from '@/lib/upscaler/store';
import { copyImageToClipboard, formatBytes, formatDuration } from '@/lib/upscaler/utils';
import { MaterialIcon } from './material-icon';
import { cn } from '@/lib/utils';

type CompareMode = 'slider' | 'side';

export function CompareModal() {
  const compareId = useStore((s) => s.compareId);
  const setCompare = useStore((s) => s.setCompare);
  const items = useStore((s) => s.items);
  const savedMode = useStore((s) => s.settings.compareMode);
  const setSettings = useStore((s) => s.setSettings);
  const [mode, setMode] = React.useState<CompareMode>(savedMode);
  // keep the stored preference in sync (survives reloads)
  React.useEffect(() => {
    if (savedMode !== mode) setMode(savedMode);
  }, [savedMode, mode]);
  const switchMode = (m: CompareMode) => {
    setMode(m);
    setSettings({ compareMode: m });
  };
  const item =
    items.find((i) => i.id === compareId && i.status === 'done' && i.result) ?? null;
  const r = item?.result ?? null;

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function';

  const onDownload = async () => {
    if (!item || !r) return;
    const blob = await (await fetch(r.url)).blob();
    downloadBlob(blob, resultFilename(item.name, r.scale, r.format, r.target));
  };

  const onCopy = async () => {
    if (!r) return;
    try {
      await copyImageToClipboard(r.url);
      const { toast } = await import('sonner');
      toast.success('Copied to clipboard');
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error('Could not copy', {
        description: err instanceof Error ? err.message : 'Clipboard unavailable',
      });
    }
  };

  const onShare = async () => {
    if (!item || !r) return;
    try {
      const blob = await (await fetch(r.url)).blob();
      const file = new File([blob], resultFilename(item.name, r.scale, r.format, r.target), {
        type: blob.type || 'image/png',
      });
      if (!navigator.canShare?.({ files: [file] })) {
        throw new Error('Sharing files is not supported here');
      }
      await navigator.share({ files: [file], title: item.name });
    } catch (err) {
      if ((err as DOMException | undefined)?.name !== 'AbortError') {
        const { toast } = await import('sonner');
        toast.error('Could not share', {
          description: err instanceof Error ? err.message : 'Share unavailable',
        });
      }
    }
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
                <Badge
                  variant="secondary"
                  className={cn(
                    'gap-1 font-mono text-[10px]',
                    r.engine === 'ai' && 'bg-primary text-primary-foreground'
                  )}
                >
                  <MaterialIcon name={r.engine === 'ai' ? 'neurology' : 'speed'} size={12} />
                  {r.engine === 'ai' ? 'AI' : 'Standard'}
                </Badge>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {r.target ? `${r.target}px` : `${r.scale}x output`}
                </Badge>
                <span>{formatDuration(r.ms)}</span>
                <span>
                  {formatBytes(item.sizeIn)} → {formatBytes(r.size)}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-2">
              {/* compare mode switch */}
              <div className="flex items-center justify-center">
                <div
                  className="flex items-center gap-0.5 rounded-full border bg-muted/50 p-0.5 shadow-sm"
                  role="group"
                  aria-label="Compare mode"
                >
                  {([
                    { id: 'slider' as const, label: 'Slider', icon: 'compare' },
                    { id: 'side' as const, label: 'Side by side', icon: 'splitscreen' },
                  ]).map(({ id, label, icon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={mode === id}
                      onClick={() => switchMode(id)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all',
                        mode === id
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <MaterialIcon
                        name={icon}
                        size={15}
                        className={cn(mode === id && 'text-primary')}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'slider' ? (
                <CompareSlider
                  beforeSrc={item.originalUrl}
                  afterSrc={r.url}
                  aspect={r.w / r.h}
                  afterLabel={`${r.scale}× upscaled`}
                  className="max-h-[56vh]"
                />
              ) : (
                <CompareSideBySide
                  beforeSrc={item.originalUrl}
                  afterSrc={r.url}
                  aspect={r.w / r.h}
                  afterLabel={`${r.scale}× upscaled`}
                  className="max-h-[56vh]"
                />
              )}
              <p className="hidden text-center text-[11px] text-muted-foreground sm:block">
                {mode === 'slider'
                  ? 'Drag the handle to compare, scroll to zoom, drag to pan when zoomed'
                  : 'Both views share zoom and pan, scroll to zoom toward the cursor'}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button variant="outline" onClick={() => void onCopy()}>
                <MaterialIcon name="content_copy" size={17} />
                Copy
              </Button>
              {canShare && (
                <Button variant="outline" onClick={() => void onShare()}>
                  <MaterialIcon name="share" size={17} />
                  Share
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => window.open(r.url, '_blank', 'noopener')}
              >
                Open full size
              </Button>
              <Button onClick={() => void onDownload()}>
                <MaterialIcon name="download" size={17} />
                Download {r.format.toUpperCase()}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
