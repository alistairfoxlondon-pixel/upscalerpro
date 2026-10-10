'use client';

import * as React from 'react';
import { useStore } from '@/lib/upscaler/store';
import { MaterialIcon } from './material-icon';
import { cn } from '@/lib/utils';

type StepState = 'done' | 'current' | 'pending';

const STEPS: { id: string; label: string; icon: string }[] = [
  { id: 'upload', label: 'Upload', icon: 'upload' },
  { id: 'enhance', label: 'Enhance', icon: 'auto_enhance' },
  { id: 'metadata', label: 'Metadata', icon: 'sell' },
  { id: 'export', label: 'Export', icon: 'archive' },
];

/** Four step progress strip that mirrors the live queue state. */
export function WorkflowSteps() {
  const items = useStore((s) => s.items);

  const done = items.filter((i) => i.status === 'done');
  const processing = items.filter((i) => i.status === 'processing' || i.status === 'queued');
  const withMeta = done.filter((i) => i.meta || i.metaState === 'loading');

  const states: StepState[] = [
    items.length > 0 ? 'done' : 'current',
    done.length > 0 ? 'done' : processing.length > 0 ? 'current' : items.length > 0 ? 'pending' : 'pending',
    withMeta.length > 0 ? 'done' : done.length > 0 ? 'current' : 'pending',
    done.length > 0 && done.length === withMeta.length ? 'current' : 'pending',
  ];

  return (
    <nav
      aria-label="Workflow progress"
      className="flex items-center gap-1 rounded-lg border bg-card p-1.5"
    >
      {STEPS.map((step, i) => (
        <React.Fragment key={step.id}>
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                'h-px flex-1 transition-colors duration-300',
                states[i] === 'done' ? 'bg-primary/50' : 'bg-border'
              )}
            />
          )}
          <span
            aria-current={states[i] === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-300',
              states[i] === 'done' && 'text-emerald-600 dark:text-emerald-400',
              states[i] === 'current' && 'bg-primary/10 text-primary',
              states[i] === 'pending' && 'text-muted-foreground'
            )}
          >
            <MaterialIcon
              name={
                states[i] === 'done'
                  ? 'check_circle'
                  : states[i] === 'current' && step.id === 'enhance'
                    ? 'progress_activity'
                    : step.icon
              }
              size={14}
              className={cn(states[i] === 'current' && step.id === 'enhance' && 'pf-spin')}
              filled={states[i] === 'done'}
            />
            {step.label}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
}
