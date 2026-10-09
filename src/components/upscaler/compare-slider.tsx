'use client';

import * as React from 'react';
import { ChevronsLeftRight, Eye, Minus, Plus, Maximize, Scan } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRememberedZoom, MIN_ZOOM, MAX_ZOOM } from './use-remembered-zoom';

interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  aspect: number; // width / height of the AFTER image
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

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
  const { initialZoom, persistZoom } = useRememberedZoom();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState(50);
  const [zoom, setZoom] = React.useState(initialZoom);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  // hold-to-peek: while held, the after image is fully clipped away
  const [peek, setPeek] = React.useState(false);

  // refs mirror state for smooth, re-render-free gesture math
  const zoomRef = React.useRef(initialZoom());
  const panRef = React.useRef({ x: 0, y: 0 });
  const mode = React.useRef<'divider' | 'pan' | 'pinch' | null>(null);
  const lastPan = React.useRef({ x: 0, y: 0 });
  // multi-touch pinch state: every active pointer + the gesture origin
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{
    startDist: number;
    startZoom: number;
    startPan: { x: number; y: number };
    startMid: { x: number; y: number };
  } | null>(null);

  // reset when a different image pair is shown — zoom restores to the
  // remembered level, pan always re-centers
  React.useEffect(() => {
    const z = initialZoom();
    zoomRef.current = z;
    panRef.current = { x: 0, y: 0 };
    setZoom(z);
    setPan({ x: 0, y: 0 });
    setPos(50);
    setPeek(false);
  }, [beforeSrc, afterSrc, initialZoom]);

  // release the peek even if the pointer comes up outside the button —
  // listeners live for the component's lifetime so ultra-fast taps can't
  // strand the peek state before the effect would have attached
  React.useEffect(() => {
    const end = () => setPeek(false);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
  }, []);

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
      persistZoom(next);
    },
    [clampPan, persistZoom]
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
    try {
      containerRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort — capture can throw for inactive/synthetic pointer ids */
    }
    if (m === 'divider') {
      setFromClientX(e.clientX);
    } else {
      lastPan.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      containerRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort — capture can throw for inactive/synthetic pointer ids */
    }
    if (pointers.current.size === 2) {
      // second finger landed — override any divider/pan gesture with a pinch
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
    // zoomed: drag pans the image; the divider grab pad opts out via stopPropagation
    beginGesture(e, zoomRef.current > 1 ? 'pan' : 'divider');
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
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // keep the content point that started under the initial midpoint
        // anchored to the live midpoint: pan = mid - center - k·(startMid - center - startPan)
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
  const stop = (e?: React.PointerEvent) => {
    if (e) pointers.current.delete(e.pointerId);
    if (mode.current === 'pinch') {
      pinch.current = null;
      // one finger left on the glass → keep panning with it when zoomed
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
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      if (!e.repeat) setPeek(true);
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'b' || e.key === 'B') setPeek(false);
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
        onKeyUp={onKeyUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={(e) => stop(e)}
        className={cn(
          'group relative touch-none select-none overflow-hidden rounded-xl border bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] outline-none ring-primary/50 focus-visible:ring-2',
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-ew-resize'
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
            style={{ clipPath: `inset(0 0 0 ${peek ? 100 : pos}%)` }}
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

        {/* hold-to-peek original (bottom-left, mirrors the zoom cluster) */}
        <button
          type="button"
          aria-label="Hold to view the original image"
          aria-pressed={peek}
          title="Hold to peek original (B)"
          onPointerDown={(e) => {
            e.stopPropagation();
            setPeek(true);
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          className={cn(
            'absolute bottom-2 left-2 z-10 flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-medium shadow-md backdrop-blur transition-colors select-none touch-none',
            peek
              ? 'border-primary/60 bg-primary text-primary-foreground'
              : 'bg-background/85 text-foreground hover:bg-muted'
          )}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          Original
        </button>

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
        Pinch to zoom · drag to pan when zoomed · hold Original to peek
      </p>
    </div>
  );
}
