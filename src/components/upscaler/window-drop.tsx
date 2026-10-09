'use client';

import * as React from 'react';
import { ImagePlus } from 'lucide-react';
import { useStore } from '@/lib/upscaler/store';

/**
 * Full-window drag & drop.
 *
 * Without this, dropping a file anywhere outside the dropzone makes the
 * browser navigate the tab straight to the raw file — destroying the queue.
 * This overlay intercepts drops on the whole page, shows an unmistakable
 * drop target, and routes every file into the normal addFiles path.
 */
export function WindowDrop() {
  const addFiles = useStore((s) => s.addFiles);
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);
  const leaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      // required on every element so the browser allows the drop + never navigates
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current -= 1;
      // debounced: dragleave fires for every child the pointer crosses — only
      // hide the overlay when no new dragenter arrived within the grace window
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => {
        leaveTimer.current = null;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }, 80);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // read BEFORE we preventDefault — after that it's always true
      const handledByDropzone = e.defaultPrevented;
      e.preventDefault();
      depth.current = 0;
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      setDragging(false);
      // bubble phase: the dropzone's own React handler has already run by now
      // (defaultPrevented) — never add the same files twice
      if (handledByDropzone) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void addFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, [addFiles]);

  if (!dragging) return null;

  return (
    <div
      className="pf-fade pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm sm:p-8"
      data-testid="window-drop-overlay"
    >
      <div className="pf-drag relative flex h-full w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary/60 bg-primary/5 text-center shadow-[0_0_100px_-24px] shadow-primary/60">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-inner">
          <ImagePlus className="pf-wiggle h-8 w-8" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-semibold tracking-tight">Drop to upscale</p>
          <p className="text-xs text-muted-foreground">
            Up to 50 images · processed on this device only
          </p>
        </div>
      </div>
    </div>
  );
}
