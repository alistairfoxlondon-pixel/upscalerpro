'use client';

import * as React from 'react';
import { ChevronsLeftRight, Minus, Plus, Maximize, Scan } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  aspect: number; // width / height of the AFTER image
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * Accessible before/after comparison slider (pointer + keyboard) with
 * pixel-peeping zoom: scroll to zoom toward the cursor, drag to pan when
 * zoomed, and a floating control cluster for keyboard-free use.
 * The "after" image sits on top and is revealed from the left.
 */
export function CompareSlider({
  beforeSrc,
  afterSrc,
  aspect,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className,
}: CompareSliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState(50);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });

  // refs mirror state for smooth, re-render-free gesture math
  const zoomRef = React.useRef(1);
  const panRef = React.useRef({ x: 0, y: 0 });
  const mode = React.useRef<'divider' | 'pan' | null>(null);
  const lastPan = React.useRef({ x: 0, y: 0 });

  // reset when a different image pair is shown
  React.useEffect(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPos(50);
  }, [beforeSrc, afterSrc]);

  const clampPan = React.useCallback((x: number, y: number, z: number) => {
    const el = containerRef.current;
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
        const el = containerRef.current;
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
    },
    [clampPan]
  );

  // wheel zoom — React attaches onWheel passively, so bind manually
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      applyZoom(zoomRef.current * Math.exp(dir * 0.22), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  const setFromClientX = React.useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, p)));
  }, []);

  const beginGesture = (e: React.PointerEvent, m: 'divider' | 'pan') => {
    mode.current = m;
    containerRef.current?.setPointerCapture?.(e.pointerId);
    if (m === 'divider') {
      setFromClientX(e.clientX);
    } else {
      lastPan.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // zoomed: drag pans the image; the divider grab pad opts out via stopPropagation
    beginGesture(e, zoomRef.current > 1 ? 'pan' : 'divider');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!mode.current) return;
    if (mode.current === 'divider') {
      setFromClientX(e.clientX);
    } else {
      const next = clampPan(
        panRef.current.x + (e.clientX - lastPan.current.x),
        panRef.current.y + (e.clientY - lastPan.current.y),
        zoomRef.current
      );
      lastPan.current = { x: e.clientX, y: e.clientY };
      panRef.current = next;
      setPan(next);
    }
  };
  const stop = () => {
    mode.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPos((p) => Math.max(0, p - 4));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPos((p) => Math.min(100, p + 4));
    } else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      applyZoom(zoomRef.current * 1.4);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      applyZoom(zoomRef.current / 1.4);
    } else if (e.key === '0' || e.key === 'f') {
      e.preventDefault();
      applyZoom(1);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Before and after comparison — arrow keys move the divider, plus and minus zoom"
        aria-valuenow={Math.round(pos)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(pos)}% after image revealed`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        className={cn(
          'group relative select-none overflow-hidden rounded-xl border bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] outline-none ring-primary/50 focus-visible:ring-2',
          zoom > 1 ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-ew-resize'
        )}
        style={{ aspectRatio: `${aspect}` }}
      >
        {/* zoomable/pannable inner stage — divider lives here so it always
            stays glued to the reveal edge while panning */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        >
          <img
            src={beforeSrc}
            alt="Original image"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
          <img
            src={afterSrc}
            alt="Upscaled image"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          />

          {/* divider (visual) + interactive grab pad — both live in stage space
              so they stay glued to the reveal edge while panning; the pad is
              counter-scaled to keep a constant on-screen width */}
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]"
            style={{ left: `${pos}%` }}
            aria-hidden
          >
            <span
              className="absolute left-1/2 top-1/2 flex h-9 w-9 items-center justify-center rounded-full border bg-background/90 shadow-md backdrop-blur transition-transform group-active:scale-95"
              style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
            >
              <ChevronsLeftRight className="h-4 w-4 text-foreground" aria-hidden />
            </span>
          </div>
          <div
            className="absolute inset-y-0 z-10"
            style={{ left: `${pos}%` }}
            role="presentation"
          >
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                beginGesture(e, 'divider');
              }}
              className="absolute inset-y-0 -translate-x-1/2 cursor-ew-resize"
              style={{ width: `${24 / zoom}px` }}
            />
          </div>
        </div>

        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-primary/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground backdrop-blur">
          {afterLabel}
        </span>

        {/* zoom controls */}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border bg-background/85 p-0.5 shadow-md backdrop-blur">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out (−)"
            disabled={zoom <= MIN_ZOOM}
            onClick={(e) => {
              e.stopPropagation();
              applyZoom(zoomRef.current / 1.4);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={zoom > 1 ? 'Reset zoom to fit' : 'Zoom to 200%'}
            title={zoom > 1 ? 'Fit to frame (0)' : 'Zoom to 200%'}
            onClick={(e) => {
              e.stopPropagation();
              applyZoom(zoom > 1 ? 1 : Math.min(2, MAX_ZOOM));
            }}
            onPointerDown={(e) => e.stopPropagation()}
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
            onClick={(e) => {
              e.stopPropagation();
              applyZoom(zoomRef.current * 1.4);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-center text-[10px] text-muted-foreground sm:hidden">
        Pinch-free zoom: use the controls · drag to pan when zoomed
      </p>
    </div>
  );
}
