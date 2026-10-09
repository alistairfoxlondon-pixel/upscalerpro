'use client';

import * as React from 'react';
import { Command } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStore } from '@/lib/upscaler/store';

/** Opens the cheat-sheet from anywhere (batch-bar button dispatches this). */
export function openShortcuts() {
  window.dispatchEvent(new CustomEvent('pf-shortcuts'));
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

const ROWS: [string, string][] = [
  ['Space', 'Pause / resume the batch'],
  ['V', 'Switch list ⇄ grid view'],
  ['?', 'Show this cheat sheet'],
  ['Esc', 'Close dialogs'],
];

export function KeyboardShortcuts() {
  const [open, setOpen] = React.useState(false);
  const busy = useStore((s) => s.busy);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const hasQueued = useStore((s) => s.items.some((i) => i.status === 'queued'));
  const queueView = useStore((s) => s.settings.queueView);
  const setSettings = useStore((s) => s.setSettings);

  React.useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('pf-shortcuts', show);
    return () => window.removeEventListener('pf-shortcuts', show);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === ' ') {
        // only meaningful while a batch runs or is paused
        if ((busy || paused) && hasQueued) {
          e.preventDefault(); // keep the page from scrolling
          togglePause();
        }
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        setSettings({ queueView: queueView === 'list' ? 'grid' : 'list' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, paused, hasQueued, togglePause, queueView, setSettings]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Command className="h-4 w-4 text-primary" aria-hidden />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Everything works by mouse too. These just speed things up.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-1 space-y-2.5 text-sm">
          {ROWS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{desc}</span>
              <kbd className="min-w-11 rounded-md border bg-muted px-2 py-0.5 text-center font-mono text-xs shadow-sm">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
