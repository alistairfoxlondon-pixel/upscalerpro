'use client';

import * as React from 'react';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Cloud,
  Copy,
  Download,
  Eye,
  FileArchive,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Share2,
  Timer,
  Trash2,
  X,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  downloadAllAsZip,
  downloadBlob,
  resultFilename,
  useStore,
} from '@/lib/upscaler/store';
import { copyImageToClipboard, formatBytes, formatDuration, shareImage } from '@/lib/upscaler/utils';
import { openShortcuts } from './keyboard-shortcuts';
import type { QueueItem } from '@/lib/upscaler/store';
import { cn } from '@/lib/utils';

const statusStyle: Record<QueueItem['status'], string> = {
  queued: 'bg-secondary text-secondary-foreground',
  processing: 'bg-primary/15 text-primary',
  done: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  error: 'bg-red-600/15 text-red-600 dark:text-red-400',
  canceled: 'bg-secondary text-muted-foreground line-through',
};

const statusIcon: Record<QueueItem['status'], React.ReactNode> = {
  queued: <Clock className="h-3 w-3" aria-hidden />,
  processing: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
  done: <CircleCheck className="h-3 w-3" aria-hidden />,
  error: <CircleAlert className="h-3 w-3" aria-hidden />,
  canceled: <Ban className="h-3 w-3" aria-hidden />,
};

function StatusChip({ item }: { item: QueueItem }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        statusStyle[item.status],
        item.status === 'done' && 'pf-pop'
      )}
    >
      {statusIcon[item.status]}
      {item.phase}
    </span>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  return (
    <svg
      viewBox="0 0 60 60"
      aria-hidden
      className="pf-pulse pointer-events-none absolute -inset-[3px] -rotate-90 text-primary"
    >
      <circle cx="30" cy="30" r="28" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <circle
        cx="30"
        cy="30"
        r="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={2 * Math.PI * 28}
        strokeDashoffset={2 * Math.PI * 28 * (1 - progress)}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

function ZipToggle({ item, className }: { item: QueueItem; className?: string }) {
  const toggleZip = useStore((s) => s.toggleZip);
  const included = item.zip !== false;
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-background/90 px-1.5 py-1',
        className
      )}
      title={included ? 'Included in ZIP export' : 'Excluded from ZIP export'}
    >
      <Checkbox
        checked={included}
        onCheckedChange={() => toggleZip(item.id)}
        aria-label={`Include ${item.name} in ZIP export`}
        className="h-3.5 w-3.5"
      />
      <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        zip
      </span>
    </label>
  );
}

function ItemActions({ item }: { item: QueueItem }) {
  const removeItem = useStore((s) => s.removeItem);
  const retry = useStore((s) => s.retry);
  const setCompare = useStore((s) => s.setCompare);
  const r = item.result;
  // Web Share with files: feature-detected once per component mount
  const [canShare] = React.useState(
    () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
  );

  const onShare = () => {
    if (!r) return;
    void shareImage(r.url, resultFilename(item.name, r.scale, r.format, r.target), item.name).catch(
      (err: unknown) => {
        if ((err as DOMException | undefined)?.name === 'AbortError') return;
        void (async () => {
          const { toast } = await import('sonner');
          toast.error('Could not share', {
            description: err instanceof Error ? err.message : 'Share unavailable',
          });
        })();
      }
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {r && item.status === 'done' && (
        <>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Compare ${item.name}`}
                  onClick={() => setCompare(item.id)}
                >
                  <Eye className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Compare before and after</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Copy ${item.name} to clipboard`}
                  onClick={() => {
                    void (async () => {
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
                    })();
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy to clipboard</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Download ${item.name}`}
            title="Download"
            onClick={() => {
              void (async () => {
                const blob = await (await fetch(r.url)).blob();
                downloadBlob(blob, resultFilename(item.name, r.scale, r.format, r.target));
              })();
            }}
          >
            <Download className="h-4 w-4" aria-hidden />
          </Button>
          {canShare && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Share ${item.name}`}
              title="Share"
              onClick={onShare}
            >
              <Share2 className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </>
      )}
      {item.status === 'done' && item.file && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Process ${item.name} again with current settings`}
                onClick={() => retry(item.id)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Process again with current settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {(item.status === 'error' || item.status === 'canceled') && item.file && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Retry ${item.name}`}
          title="Retry"
          onClick={() => retry(item.id)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${item.name}`}
        title="Remove"
        onClick={() => removeItem(item.id)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

function buildMeta(item: QueueItem): string {
  const r = item.result;
  const meta: string[] = [];
  if (item.w) meta.push(`${item.w}x${item.h}`);
  if (r) meta.push(`→ ${r.w}x${r.h}`);
  if (item.sizeIn) meta.push(formatBytes(item.sizeIn));
  if (r && r.size > 0) meta.push(`→ ${formatBytes(r.size)}`);
  if (r && r.ms > 0) meta.push(formatDuration(r.ms));
  return meta.join(' · ');
}

function QueueItemRow({ item, index }: { item: QueueItem; index: number }) {
  const r = item.result;
  const excluded = item.status === 'done' && item.zip === false;

  return (
    <li
      style={{ ['--i' as string]: index }}
      className={cn(
        'pf-rise group flex items-center gap-3 rounded-lg border bg-card p-3 transition-all duration-200 hover:border-primary/40 hover:shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20',
        item.status === 'processing' && 'border-primary/40 bg-primary/5',
        item.status === 'error' && 'border-red-600/30',
        excluded && 'opacity-55'
      )}
    >
      {/* ZIP selection for finished items */}
      {item.status === 'done' && <ZipToggle item={item} />}

      {/* thumbnail + progress ring */}
      <div className="relative h-14 w-14 shrink-0">
        <div className="h-full w-full overflow-hidden rounded-md border bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:10px_10px]">
          {item.thumbUrl ? (
            <img
              src={item.thumbUrl}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-all duration-300',
                item.status === 'processing' && 'opacity-80'
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" aria-hidden />
            </div>
          )}
          {r && (
            <span className="absolute bottom-0 right-0 flex">
              <span className="bg-black/60 px-1 py-px font-mono text-[9px] font-semibold text-white">
                {r.format.toUpperCase()}
              </span>
              <span className="bg-primary px-1 py-px font-mono text-[9px] font-semibold text-primary-foreground">
                {r.target ? `${r.target}px` : `${r.scale}x`}
              </span>
            </span>
          )}
        </div>
        {item.status === 'processing' && <ProgressRing progress={item.progress} />}
      </div>

      {/* main */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <StatusChip item={item} />
        </div>

        <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
          {buildMeta(item) || item.mime}
        </p>

        {item.status === 'processing' && (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress
              value={item.progress * 100}
              className="h-1.5 pf-stripes"
              aria-label={`${item.name} progress`}
            />
            {item.speed && (
              <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {item.speed}
              </span>
            )}
            <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {Math.round(item.progress * 100)}%
            </span>
          </div>
        )}
        {item.status === 'error' && item.error && (
          <p className="mt-0.5 truncate text-[11px] text-red-600 dark:text-red-400" title={item.error}>
            {item.error}
          </p>
        )}
      </div>

      <ItemActions item={item} />
    </li>
  );
}

function QueueCard({ item, index }: { item: QueueItem; index: number }) {
  const r = item.result;
  const excluded = item.status === 'done' && item.zip === false;

  return (
    <li
      style={{ ['--i' as string]: Math.min(index, 11) }}
      className={cn(
        'pf-rise group flex flex-col gap-2 rounded-lg border bg-card p-2.5 transition-all duration-200 hover:border-primary/40 hover:shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20',
        item.status === 'processing' && 'border-primary/40 bg-primary/5',
        item.status === 'error' && 'border-red-600/30',
        excluded && 'opacity-55'
      )}
    >
      {/* thumbnail stage */}
      <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
        {item.thumbUrl ? (
          <img
            src={item.thumbUrl}
            alt=""
            className={cn(
              'h-full w-full object-contain p-1 transition-all duration-300',
              item.status === 'processing' && 'opacity-80'
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <X className="h-5 w-5" aria-hidden />
          </div>
        )}

        {/* badges */}
        {r && (
          <span className="absolute left-1.5 top-1.5 flex flex-nowrap items-center gap-1 whitespace-nowrap">
            <span className="shrink-0 rounded-sm bg-primary px-1.5 py-px font-mono text-[9px] font-semibold text-primary-foreground">
              {r.target ? `${r.target}px` : `${r.scale}x`}
            </span>
            <span className="shrink-0 rounded-sm bg-black/60 px-1 py-px font-mono text-[9px] font-semibold text-white">
              {r.format.toUpperCase()}
            </span>
          </span>
        )}

        {/* status chip overlays the top when not done */}
        {item.status !== 'done' && (
          <span className="absolute right-1.5 top-1.5">
            <StatusChip item={item} />
          </span>
        )}

        {/* ZIP selection for finished items */}
        {item.status === 'done' && <ZipToggle item={item} className="absolute right-1.5 top-1.5" />}

        {/* centered progress ring while processing */}
        {item.status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <div className="relative h-12 w-12">
              <ProgressRing progress={item.progress} />
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold tabular-nums text-foreground">
                {Math.round(item.progress * 100)}
              </span>
            </div>
          </div>
        )}

        {/* hover compare affordance */}
        {r && item.status === 'done' && (
          <button
            type="button"
            aria-label={`Compare ${item.name}`}
            onClick={() => useStore.getState().setCompare(item.id)}
            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 hover:bg-black/40 hover:opacity-100 focus-visible:opacity-100"
          >
            <Eye className="h-6 w-6 text-white drop-shadow" aria-hidden />
          </button>
        )}
      </div>

      {/* info */}
      <div className="min-w-0 space-y-0.5 px-0.5">
        <p className="truncate text-xs font-medium" title={item.name}>
          {item.name}
        </p>
        <p className="truncate text-[10px] text-muted-foreground tabular-nums">
          {buildMeta(item) || item.mime}
        </p>
        {item.status === 'processing' && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Progress
              value={item.progress * 100}
              className="h-1 pf-stripes"
              aria-label={`${item.name} progress`}
            />
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">
              {item.speed ? `${item.speed} · ` : ''}
              {Math.round(item.progress * 100)}%
            </span>
          </div>
        )}
        {item.status === 'error' && item.error && (
          <p className="truncate text-[10px] text-red-600 dark:text-red-400" title={item.error}>
            {item.error}
          </p>
        )}
      </div>

      <div className="-mx-0.5 flex justify-end border-t border-border pt-1.5">
        <ItemActions item={item} />
      </div>
    </li>
  );
}

export function Queue() {
  const items = useStore((s) => s.items);
  const busy = useStore((s) => s.busy);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const clearFinished = useStore((s) => s.clearFinished);
  const clearAll = useStore((s) => s.clearAll);
  const retry = useStore((s) => s.retry);
  const totals = useStore((s) => s.totals);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const view = settings.queueView;

  const doneCount = items.filter((i) => i.status === 'done').length;
  const queuedCount = items.filter((i) => i.status === 'queued').length;
  const failedCount = items.filter((i) => (i.status === 'error' || i.status === 'canceled') && i.file).length;
  const zipCount = items.filter((i) => i.status === 'done' && i.result && i.zip !== false).length;
  // with parallel processing several items advance at once: average them all
  const processingSum = items
    .filter((i) => i.status === 'processing')
    .reduce((acc, i) => acc + i.progress, 0);
  const overall =
    items.length === 0 ? 0 : (doneCount + processingSum) / items.length;

  const hasDone = doneCount > 0;
  const hasQueued = queuedCount > 0;

  // rough ETA from the session average, meaningful once one image finished
  const avgMs = totals.images > 0 ? totals.ms / totals.images : 0;
  const eta =
    busy && !paused && hasQueued && avgMs > 0
      ? (avgMs / 2) * (queuedCount + 1)
      : 0;

  return (
    <div className="space-y-3">
      {/* batch bar */}
      <div
        className={cn(
          'rounded-lg border bg-card p-3 transition-colors',
          paused && busy && 'border-amber-600/40 bg-amber-500/5'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {busy && !paused && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={togglePause} disabled={!hasQueued}>
                <Pause className="h-3.5 w-3.5" aria-hidden />
                Pause
              </Button>
            )}
            {paused && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={togglePause} disabled={!hasQueued}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Resume
              </Button>
            )}
            {failedCount > 0 && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => {
                        items
                          .filter((i) => (i.status === 'error' || i.status === 'canceled') && i.file)
                          .forEach((i) => retry(i.id));
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Retry failed
                      <span className="font-mono text-[10px] text-muted-foreground">({failedCount})</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Process all failed and canceled images again</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => void downloadAllAsZip()}
                    disabled={zipCount === 0}
                  >
                    <FileArchive className="h-3.5 w-3.5" aria-hidden />
                    ZIP all
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ({zipCount}
                      {hasDone && zipCount !== doneCount ? `/${doneCount}` : ''})
                    </span>
                  </Button>
                </TooltipTrigger>
                {hasDone && zipCount !== doneCount && (
                  <TooltipContent>Deselect items with the ZIP checkboxes to skip them</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={clearFinished}
              disabled={!items.some((i) => i.status !== 'queued' && i.status !== 'processing')}
            >
              Clear finished
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground hover:text-destructive"
              onClick={clearAll}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear all
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {eta > 0 && (
              <Badge
                variant="outline"
                className="gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
                title={`Based on the ${formatDuration(avgMs)} average of this session`}
              >
                <Timer className="h-3 w-3" aria-hidden />
                ~{formatDuration(eta)} left
              </Badge>
            )}
            <Badge variant="outline" className="gap-1 font-mono text-[10px] text-muted-foreground">
              <Cloud className="h-3 w-3" aria-hidden />
              Cloud
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {doneCount}/{items.length} done
              {totals.ms > 0 && ` · ${formatDuration(totals.ms)} total`}
            </Badge>
            {/* shortcuts + view switch */}
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Keyboard shortcuts"
                      title="Keyboard shortcuts (?)"
                      onClick={openShortcuts}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Keyboard className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Keyboard shortcuts</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center rounded-md border p-0.5" role="group" aria-label="Queue layout">
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                  title="List view (V)"
                  onClick={() => setSettings({ queueView: 'list' })}
                  className={cn(
                    'flex h-7 w-8 items-center justify-center rounded-sm transition-colors',
                    view === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                  title="Grid view (V)"
                  onClick={() => setSettings({ queueView: 'grid' })}
                  className={cn(
                    'flex h-7 w-8 items-center justify-center rounded-sm transition-colors',
                    view === 'grid' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <Progress value={overall * 100} className="h-1.5" aria-label="Overall batch progress" />
          <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(overall * 100)}%
          </span>
        </div>
        {paused && busy && (
          <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            Paused. The current image will finish, queued ones wait.
          </p>
        )}
      </div>

      {/* items */}
      {view === 'list' ? (
        <ul className="fancy-scroll max-h-[52vh] space-y-2 overflow-y-auto pr-1" role="list">
          {items.map((item, i) => (
            <QueueItemRow key={item.id} item={item} index={i} />
          ))}
        </ul>
      ) : (
        <ul className="fancy-scroll grid max-h-[58vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4" role="list">
          {items.map((item, i) => (
            <QueueCard key={item.id} item={item} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
