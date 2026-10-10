'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStore } from '@/lib/upscaler/store';
import {
  assessReadiness,
  CATEGORIES,
  STOCK,
  categoryName,
  type CheckLevel,
} from '@/lib/upscaler/stock';
import type { QueueItem } from '@/lib/upscaler/store';
import { MaterialIcon } from './material-icon';
import { cn } from '@/lib/utils';

const levelIcon: Record<CheckLevel, string> = {
  pass: 'check_circle',
  warn: 'error',
  fail: 'cancel',
};

const levelColor: Record<CheckLevel, string> = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  fail: 'text-red-600 dark:text-red-400',
};

function KeywordChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-[11px] text-secondary-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove keyword ${label}`}
        onClick={onRemove}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <MaterialIcon name="close" size={11} />
      </button>
    </span>
  );
}

/** Readiness checklist + editable AI metadata for one finished item. */
export function StockPanel({ item }: { item: QueueItem }) {
  const generateMetadata = useStore((s) => s.generateMetadata);
  const updateMeta = useStore((s) => s.updateMeta);
  const [open, setOpen] = React.useState(false);
  const [keywordDraft, setKeywordDraft] = React.useState('');

  const readiness = React.useMemo(() => assessReadiness(item, item.stats), [item]);
  const meta = item.meta;
  const metaState = item.metaState ?? 'idle';

  const addKeyword = () => {
    if (!meta) return;
    const parts = keywordDraft
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length >= 2 && !meta.keywords.includes(k));
    if (parts.length) {
      updateMeta(item.id, {
        keywords: [...meta.keywords, ...parts].slice(0, STOCK.keywordsMax),
      });
    }
    setKeywordDraft('');
  };

  const verdictBadge =
    readiness.verdict === 'ready'
      ? { cls: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400', label: 'Ready' }
      : readiness.verdict === 'notes'
        ? { cls: 'bg-amber-600/15 text-amber-700 dark:text-amber-400', label: `${readiness.warns} note${readiness.warns > 1 ? 's' : ''}` }
        : { cls: 'bg-red-600/15 text-red-600 dark:text-red-400', label: `Fix ${readiness.fails}` };

  return (
    <div className="mt-2.5 border-t pt-2.5" onClick={(e) => e.stopPropagation()}>
      {/* summary row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
            verdictBadge.cls,
            'hover:brightness-95'
          )}
        >
          <MaterialIcon name={open ? 'unfold_less' : 'checklist'} size={12} />
          {verdictBadge.label}
        </button>

        {meta ? (
          <>
            <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px] font-medium text-muted-foreground">
              <MaterialIcon name="sell" size={10} />
              {meta.keywords.length}/49
            </Badge>
            {meta.category > 0 && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px] font-medium text-muted-foreground">
                <MaterialIcon name="category" size={10} />
                {categoryName(meta.category)}
              </Badge>
            )}
            {meta.aiGenerated && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px] font-medium text-primary">
                <MaterialIcon name="psychology" size={10} />
                AI
              </Badge>
            )}
          </>
        ) : metaState === 'loading' ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <MaterialIcon name="progress_activity" size={11} className="pf-spin" />
            AI is writing titles and keywords
          </span>
        ) : metaState === 'error' ? (
          <button
            type="button"
            onClick={() => void generateMetadata(item.id)}
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
          >
            <MaterialIcon name="refresh" size={11} />
            Metadata failed, retry
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void generateMetadata(item.id)}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <MaterialIcon name="psychology" size={11} />
            Generate metadata
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={open ? 'Collapse stock panel' : 'Expand stock panel'}
        >
          <MaterialIcon name={open ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={16} />
        </button>
      </div>

      {open && (
        <div className="pf-fade-up mt-3 space-y-3">
          {/* readiness checklist */}
          <ul className="space-y-1" aria-label="Adobe Stock readiness checks">
            {readiness.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <MaterialIcon
                  name={levelIcon[c.level]}
                  size={13}
                  className={cn('mt-px shrink-0', levelColor[c.level])}
                />
                <span>
                  <span className="font-medium text-foreground">{c.label}:</span>{' '}
                  <span className="text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* metadata editor */}
          {meta && (
            <div className="space-y-2.5 rounded-md border bg-background p-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold">
                  <MaterialIcon name="title" size={14} className="text-primary" />
                  Title
                </span>
                <span
                  className={cn(
                    'font-mono text-[10px] tabular-nums',
                    meta.title.length > STOCK.titleRecommended ? 'text-amber-600' : 'text-muted-foreground'
                  )}
                >
                  {meta.title.length}/{STOCK.titleMax}
                </span>
              </div>
              <textarea
                value={meta.title}
                onChange={(e) => updateMeta(item.id, { title: e.target.value.slice(0, STOCK.titleMax) })}
                rows={2}
                aria-label="Adobe Stock title"
                className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed outline-none transition-colors focus:ring-2 focus:ring-primary/50"
              />
              {meta.description && (
                <p className="text-[10px] leading-snug text-muted-foreground">{meta.description}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold">
                  <MaterialIcon name="sell" size={14} className="text-primary" />
                  Keywords
                </span>
                <span
                  className={cn(
                    'font-mono text-[10px] tabular-nums',
                    meta.keywords.length > STOCK.keywordsMax ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {meta.keywords.length}/{STOCK.keywordsMax}
                </span>
              </div>
              {meta.keywords.length > 0 && (
                <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {meta.keywords.map((k) => (
                    <KeywordChip
                      key={k}
                      label={k}
                      onRemove={() =>
                        updateMeta(item.id, {
                          keywords: meta.keywords.filter((x) => x !== k),
                        })
                      }
                    />
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Input
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="Add keyword, comma separated"
                  aria-label="Add keywords"
                  className="h-8 flex-1 rounded-md text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-md px-2.5"
                  onClick={addKeyword}
                  disabled={!keywordDraft.trim() || meta.keywords.length >= STOCK.keywordsMax}
                >
                  Add
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold">
                  <MaterialIcon name="category" size={14} className="text-primary" />
                  Category
                </span>
                <Select
                  value={meta.category > 0 ? String(meta.category) : '0'}
                  onValueChange={(v) => updateMeta(item.id, { category: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-[210px] rounded-md text-xs" aria-label="Adobe Stock category">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="0" className="text-xs">
                      None
                    </SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                        {c.id}. {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <p className="text-[10px] text-muted-foreground">
                  {meta.aiGenerated ? 'Generated by AI, edits keep working' : 'Edited by you'}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-md px-2 text-[11px] text-primary hover:text-primary"
                  onClick={() => void generateMetadata(item.id)}
                  disabled={metaState === 'loading'}
                >
                  <MaterialIcon name="refresh" size={13} />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
