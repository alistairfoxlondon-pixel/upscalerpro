'use client';

import * as React from 'react';
import { Minus, Plus, Maximize, Scan } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRememberedZoom, MIN_ZOOM, MAX_ZOOM } from './use-remembered-zoom';

interface CompareSideBySideProps {
  beforeSrc: string;
  afterSrc: string;
  aspect: number; // width / height
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

/**
 * Side-by-side comparison with pixel-locked sync: both panes share one
 * zoom/pan transform, so the same region is always under inspection in
 * Before and After — ideal for judging fine detail recovery.
 */
export function CompareSideBySide({
  beforeSrc,
  afterSrc,
  aspect,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className,
}: CompareSideBySideProps) {
  const { initialZoom, persistZoom } = useRememberedZoom();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(initialZoom);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });

  const zoomRef = React.useRef(initialZoom());
  const panRef = React.useRef({ x: 0, y: 0 });
  const mode = React.useRef<'pan' | 'pinch' | null>(null);
  const lastPan = React.useRef({ x: 0, y: 0 });
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{
    startDist: number;
    startZoom: number;
    startPan: { x: number; y: number };
    startMid: { x: number; y: number };
  } | null>(null);

  React.useEffect(() => {
    const z = initialZoom();
    zoomRef.current = z;
    panRef.current = { x: 0, y: 0 };
    setZoom(z);
    setPan({ x: 0, y: 0 });
  }, [beforeSrc, afterSrc, initialZoom]);

  const clampPan = React.useCallback((x: number, y: number, z: number) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const mx = ((z - 1) * rect.width) / 2;
    const my = ((z - 1) * rect.height) / 2;
    return {
      x: Math.min(mx, Math.max(-mx, x)),
      y: Math.min(my, Math.max(-my, y)),
    };
  }, []);

  const applyZoom = React.useCallback(
    (nextZRaw: number, focal?: { x: number; y: number }) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZRaw));
      const prev = zoomRef.current;
      let nextPan = panRef.current;
      if (focal && prev !== next) {
        const el = wrapRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const cx = focal.x - rect.left - rect.width / 2;
          const cy = focal.y - rect.top - rect.height / 2;
          const k = next / prev;
          nextPan = {
            x: cx * (1 - k) + panRef.current.x * k,
            y: cy * (1 - k) + panRef.current.y * k,
          };
        }
      }
      if (next === 1) nextPan = { x: 0, y: 0 };
      nextPan = clampPan(nextPan.x, nextPan.y, next);
      zoomRef.current = next;
      panRef.current = nextPan;
      setZoom(next);
      setPan(nextPan);
      persistZoom(next);
    },
    [clampPan, persistZoom]
  );

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      applyZoom(zoomRef.current * Math.exp(dir * 0.22), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      wrapRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    if (pointers.current.size === 2) {
      mode.current = 'pinch';
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: zoomRef.current,
        startPan: { ...panRef.current },
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    mode.current = 'pan';
    lastPan.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (mode.current === 'pinch') {
      if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      const p = pinch.current;
      if (!p || pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.startZoom * (dist / p.startDist)));
      const el = wrapRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = nextZoom / p.startZoom;
        const next = clampPan(
          mid.x - rect.left - rect.width / 2 -
            k * (p.startMid.x - rect.left - rect.width / 2 - p.startPan.x),
          mid.y - rect.top - rect.height / 2 -
            k * (p.startMid.y - rect.top - rect.height / 2 - p.startPan.y),
          nextZoom
        );
        zoomRef.current = nextZoom;
        panRef.current = next;
        setZoom(nextZoom);
        setPan(next);
        persistZoom(nextZoom);
      }
      return;
    }
    if (mode.current !== 'pan') return;
    const next = clampPan(
      panRef.current.x + (e.clientX - lastPan.current.x),
      panRef.current.y + (e.clientY - lastPan.current.y),
      zoomRef.current
    );
    lastPan.current = { x: e.clientX, y: e.clientY };
    panRef.current = next;
    setPan(next);
  };

  const stop = (e?: React.PointerEvent) => {
    if (e) pointers.current.delete(e.pointerId);
    if (mode.current === 'pinch') {
      pinch.current = null;
      const rest = [...pointers.current.values()];
      if (rest.length === 1 && zoomRef.current > 1) {
        mode.current = 'pan';
        lastPan.current = { x: rest[0].x, y: rest[0].y };
      } else if (rest.length === 0) {
        mode.current = null;
      }
      return;
    }
    mode.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      applyZoom(zoomRef.current * 1.4);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      applyZoom(zoomRef.current / 1.4);
    } else if (e.key === '0' || e.key === 'f') {
      e.preventDefault();
      applyZoom(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPan((p) => clampPan(p.x + 24, p.y, zoomRef.current));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPan((p) => clampPan(p.x - 24, p.y, zoomRef.current));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPan((p) => clampPan(p.x, p.y + 24, zoomRef.current));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPan((p) => clampPan(p.x, p.y - 24, zoomRef.current));
    }
  };

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div className={cn('relative', className)}>
      <div
        ref={wrapRef}
        role="group"
        tabIndex={0}
        aria-label="Side-by-side comparison — both views share zoom and pan; scroll to zoom toward the cursor, drag to pan"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={(e) => stop(e)}
        className={cn(
          'grid touch-none select-none grid-cols-2 gap-2 rounded-xl outline-none ring-primary/50 focus-visible:ring-2',
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        )}
      >
        {([
          { src: beforeSrc, label: beforeLabel, highlight: false },
          { src: afterSrc, label: afterLabel, highlight: true },
        ] as const).map((pane) => (
          <div
            key={pane.label}
            className="relative aspect-square overflow-hidden rounded-xl border bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
            style={{ aspectRatio: `${aspect}` }}
          >
            <div
              className="absolute inset-0"
              style={{ transform, transformOrigin: 'center' }}
            >
              <img
                src={pane.src}
                alt={pane.highlight ? 'Upscaled image' : 'Original image'}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />
            </div>
            <span
              className={cn(
                'pointer-events-none absolute left-2 top-2 z-10 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur',
                pane.highlight ? 'bg-primary/90 text-primary-foreground' : 'bg-black/55'
              )}
            >
              {pane.label}
            </span>
          </div>
        ))}
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border bg-background/85 p-0.5 shadow-md backdrop-blur">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (−)"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => applyZoom(zoomRef.current / 1.4)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={zoom > 1 ? 'Reset zoom to fit' : 'Zoom to 200%'}
          title={zoom > 1 ? 'Fit to frame (0)' : 'Zoom to 200%'}
          onClick={() => applyZoom(zoom > 1 ? 1 : Math.min(2, MAX_ZOOM))}
          className="flex h-7 min-w-14 items-center justify-center gap-1 rounded-md px-1 font-mono text-[10px] tabular-nums text-foreground transition-colors hover:bg-muted"
        >
          {zoom > 1 ? <Scan className="h-3 w-3" aria-hidden /> : <Maximize className="h-3 w-3" aria-hidden />}
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => applyZoom(zoomRef.current * 1.4)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <p className="mt-1.5 text-center text-[10px] text-muted-foreground sm:hidden">
        Pinch to zoom · views stay in sync
      </p>
    </div>
  );
}
