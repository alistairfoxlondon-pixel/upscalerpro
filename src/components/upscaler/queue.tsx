'use client';

import * as React from 'react';
import {
  Download,
  Eye,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  FileArchive,
  X,
  CircleCheck,
  CircleAlert,
  Ban,
  Clock,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { PRESETS } from '@/lib/upscaler/registry';
import {
  downloadAllAsZip,
  downloadBlob,
  resultFilename,
  useStore,
} from '@/lib/upscaler/store';
import { formatBytes, formatDuration } from '@/lib/upscaler/utils';
import type { QueueItem } from '@/lib/upscaler/store';
import { cn } from '@/lib/utils';

const statusStyle: Record<QueueItem['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  processing: 'bg-primary/15 text-primary',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  error: 'bg-red-500/15 text-red-600 dark:text-red-400',
  canceled: 'bg-muted text-muted-foreground line-through',
};

const statusIcon: Record<QueueItem['status'], React.ReactNode> = {
  queued: <Clock className="h-3 w-3" aria-hidden />,
  processing: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
  done: <CircleCheck className="h-3 w-3" aria-hidden />,
  error: <CircleAlert className="h-3 w-3" aria-hidden />,
  canceled: <Ban className="h-3 w-3" aria-hidden />,
};

function QueueItemRow({ item, index }: { item: QueueItem; index: number }) {
  const removeItem = useStore((s) => s.removeItem);
  const retry = useStore((s) => s.retry);
  const setCompare = useStore((s) => s.setCompare);
  const r = item.result;

  const meta: string[] = [];
  if (item.w) meta.push(`${item.w}×${item.h}`);
  if (r) meta.push(`→ ${r.w}×${r.h}`);
  if (item.sizeIn) meta.push(formatBytes(item.sizeIn));
  if (r && r.size > 0) meta.push(`→ ${formatBytes(r.size)}`);
  if (r && r.ms > 0) meta.push(formatDuration(r.ms));

  return (
    <li
      style={{ ['--i' as string]: index }}
      className={cn(
        'pf-rise group flex items-center gap-3 rounded-xl border bg-card/60 p-3 transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-card hover:shadow-md',
        item.status === 'processing' && 'border-primary/40 bg-primary/5 shadow-[0_0_24px_-12px] shadow-primary/50',
        item.status === 'error' && 'border-red-500/30'
      )}
    >
      {/* thumbnail + progress ring */}
      <div className="relative h-14 w-14 shrink-0">
        <div className="h-full w-full overflow-hidden rounded-lg border bg-muted/40">
        {item.thumbUrl ? (
           
          <img
              src={item.thumbUrl}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-all duration-500',
                item.status === 'processing' && 'scale-105 blur-[1px] brightness-90'
              )}
            />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <X className="h-4 w-4" aria-hidden />
          </div>
        )}
          {r && (
            <span className="absolute bottom-0 right-0 rounded-tl-md bg-primary px-1 py-px font-mono text-[9px] font-semibold text-primary-foreground">
              {r.scale}×
            </span>
          )}
        </div>
        {item.status === 'processing' && (
          <svg
            viewBox="0 0 60 60"
            aria-hidden
            className="pointer-events-none absolute -inset-[3px] -rotate-90 text-primary"
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
              strokeDashoffset={2 * Math.PI * 28 * (1 - item.progress)}
              className="transition-[stroke-dashoffset] duration-200"
            />
          </svg>
        )}
      </div>

      {/* main */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
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
        </div>

        <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
          {meta.length ? meta.join(' · ') : item.mime}
        </p>

        {item.status === 'processing' && (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress
              value={item.progress * 100}
              className="h-1.5 pf-stripes"
              aria-label={`${item.name} progress`}
            />
            <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {Math.round(item.progress * 100)}%
            </span>
          </div>
        )}
        {item.status === 'error' && item.error && (
          <p className="mt-0.5 truncate text-[11px] text-red-500">{item.error}</p>
        )}
      </div>

      {/* actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {r && item.status === 'done' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Compare ${item.name}`}
              title="Compare before / after"
              onClick={() => setCompare(item.id)}
            >
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Download ${item.name}`}
              title="Download"
              onClick={() => {
                void (async () => {
                  const blob = await awaitBlob(r.url);
                  downloadBlob(blob, resultFilename(item.name, r.scale, r.format));
                })();
              }}
            >
              <Download className="h-4 w-4" aria-hidden />
            </Button>
          </>
        )}
        {(item.status === 'error' || item.status === 'canceled') && (
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
    </li>
  );
}

async function awaitBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export function Queue() {
  const items = useStore((s) => s.items);
  const busy = useStore((s) => s.busy);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const clearFinished = useStore((s) => s.clearFinished);
  const clearAll = useStore((s) => s.clearAll);
  const backend = useStore((s) => s.backend);
  const totals = useStore((s) => s.totals);

  const doneCount = items.filter((i) => i.status === 'done').length;
  const active = items.find((i) => i.status === 'processing');
  const overall =
    items.length === 0
      ? 0
      : (doneCount + (active ? active.progress : 0)) / items.length;

  const hasDone = doneCount > 0;
  const hasQueued = items.some((i) => i.status === 'queued');

  return (
    <div className="space-y-3">
      {/* batch bar */}
      <div className="rounded-xl border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            {busy && !paused && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={togglePause} disabled={!hasQueued}>
                <Pause className="h-3.5 w-3.5" aria-hidden />
                Pause
              </Button>
            )}
            {paused && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={togglePause}
                disabled={!hasQueued}
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                Resume
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => void downloadAllAsZip()}
              disabled={!hasDone}
            >
              <FileArchive className="h-3.5 w-3.5" aria-hidden />
              ZIP all
              {hasDone && <span className="font-mono text-[10px] text-muted-foreground">({doneCount})</span>}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={clearFinished} disabled={!items.some((i) => i.status !== 'queued' && i.status !== 'processing')}>
              Clear finished
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-destructive" onClick={clearAll}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear all
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {backend && (
              <Badge variant="outline" className="gap-1 font-mono text-[10px] text-muted-foreground">
                <Cpu className="h-3 w-3" aria-hidden />
                {backend === 'webgl' ? 'WebGL' : backend.toUpperCase()}
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {doneCount}/{items.length} done
              {totals.ms > 0 && ` · ${formatDuration(totals.ms)} total`}
            </Badge>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <Progress value={overall * 100} className="h-1.5" aria-label="Overall batch progress" />
          <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(overall * 100)}%
          </span>
        </div>
        {paused && busy && (
          <p className="mt-1.5 text-[11px] text-amber-500">
            Paused — the current image will finish, queued ones wait.
          </p>
        )}
      </div>

      {/* items */}
      <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-1 fancy-scroll" role="list">
        {items.map((item, i) => (
          <QueueItemRow key={item.id} item={item} index={i} />
        ))}
      </ul>
    </div>
  );
}
