'use client';

import * as React from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  aspect: number; // width / height of the AFTER image
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

/**
 * Accessible before/after comparison slider (pointer + keyboard).
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
  const dragging = React.useRef(false);

  const setFromClientX = React.useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, p)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setFromClientX(e.clientX);
  };
  const stop = () => {
    dragging.current = false;
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
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison"
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
        className
      )}
      style={{ aspectRatio: `${aspect}` }}
    >
      { }
      <img
        src={beforeSrc}
        alt="Original image"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      />
      { }
      <img
        src={afterSrc}
        alt="Upscaled image"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
      />

      {/* divider */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]"
        style={{ left: `${pos}%` }}
        aria-hidden
      >
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-md backdrop-blur transition-transform group-active:scale-95">
          <ChevronsLeftRight className="h-4 w-4 text-foreground" aria-hidden />
        </span>
      </div>

      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-primary/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
}
