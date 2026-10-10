'use client';

import * as React from 'react';
import { useStore } from '@/lib/upscaler/store';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z || 1));

/**
 * Remembers the pixel-peep zoom level across comparisons (and reloads) via
 * the persisted settings store. Pan always resets per image — the zoom level
 * is the part worth keeping when inspecting a whole batch at the same
 * magnification.
 */
export function useRememberedZoom() {
  const remembered = useStore((s) => s.settings.compareZoom);
  const setSettings = useStore((s) => s.setSettings);
  const rememberedRef = React.useRef(clampZoom(remembered));
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = React.useRef<number | null>(null);

  // mirror the persisted value into a ref outside of render
  React.useEffect(() => {
    rememberedRef.current = clampZoom(remembered);
  }, [remembered]);

  React.useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  /** initial (or per-image reset) zoom — the remembered level */
  const initialZoom = React.useCallback(() => rememberedRef.current, []);

  /** debounce-persist zoom changes while the user is pinching/scrolling */
  const persistZoom = React.useCallback(
    (z: number) => {
      const next = clampZoom(z);
      const prev = lastSaved.current ?? rememberedRef.current;
      if (Math.abs(next - prev) < 0.01) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        lastSaved.current = next;
        setSettings({ compareZoom: next });
      }, 500);
    },
    [setSettings]
  );

  return { initialZoom, persistZoom };
}
