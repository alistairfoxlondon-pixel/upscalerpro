'use client';

import * as React from 'react';
import { Zap, Gauge, Crown, AlertTriangle, Check, Wand2, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { PRESETS, PRESET_ORDER, SCALES } from '@/lib/upscaler/registry';
import { useStore } from '@/lib/upscaler/store';
import type { FormatChoice, PresetId, ScaleFactor } from '@/lib/upscaler/types';
import { cn } from '@/lib/utils';

const speedDots = (n: number) => [1, 2, 3].map((i) => (
  <span key={i} className={cn('h-1.5 w-3 rounded-full', i <= n ? 'bg-primary' : 'bg-muted')} />
));

const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const preset = PRESETS[settings.preset];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          Upscale settings
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            {preset.model}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Model preset */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">AI engine</span>
            <span className="text-[10px] text-muted-foreground">speed → quality</span>
          </div>
          <ToggleGroup
            type="single"
            value={settings.preset}
            onValueChange={(v) => v && setSettings({ preset: v as PresetId })}
            className="w-full gap-2"
          >
            {PRESET_ORDER.map((id) => {
              const p = PRESETS[id];
              const Icon = id === 'fast' ? Zap : id === 'balanced' ? Gauge : Crown;
              return (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  aria-label={`${p.label} — ${p.desc}`}
                  className="h-auto flex-1 flex-col gap-1 rounded-lg border px-2 py-2.5 data-[state=on]:border-primary data-[state=on]:bg-primary/10"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-medium">{p.label}</span>
                  <span className="flex gap-0.5">{speedDots(p.speed)}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <p className="text-[11px] leading-snug text-muted-foreground">{preset.desc}</p>
          {settings.preset === 'studio' && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Downloads ~{preset.sizeMB} MB of weights and runs much slower — ideal for small images.
            </p>
          )}
        </div>

        {/* Scale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Upscale factor</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {settings.scale}× = {settings.scale * settings.scale}× more pixels
            </span>
          </div>
          <ToggleGroup
            type="single"
            value={String(settings.scale)}
            onValueChange={(v) => v && setSettings({ scale: Number(v) as ScaleFactor })}
            className="w-full gap-2"
          >
            {SCALES.map((s) => (
              <ToggleGroupItem
                key={s}
                value={String(s)}
                aria-label={`${s} times upscale${s === 8 ? ' (small images only)' : ''}`}
                title={s === 8 ? '8× chains two AI passes — needs a small source image' : undefined}
                className="relative flex-1 rounded-lg border font-mono text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10"
              >
                {s}×
                {s === 8 && (
                  <span
                    className="absolute -top-1.5 right-1 rounded-full bg-primary px-1 py-px font-sans text-[8px] font-bold uppercase tracking-wide text-primary-foreground"
                    aria-hidden
                  >
                    max
                  </span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {settings.scale === 8 && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              8× chains two AI passes (4× → 2×) for 64× more pixels — best for small images; larger ones auto-drop to 4×.
            </p>
          )}
          {settings.scale === 8 && settings.preset === 'studio' && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              8× on Studio chains two ~29 MB models and needs a lot of memory — Fast or Balanced is the safer pick for 8×.
            </p>
          )}
        </div>

        {/* Output format */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Output format</span>
          <ToggleGroup
            type="single"
            value={settings.format}
            onValueChange={(v) => v && setSettings({ format: v as FormatChoice })}
            className="w-full gap-1.5"
          >
            {FORMATS.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                aria-label={`Output as ${f.label}`}
                className="flex-1 rounded-lg border text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
              >
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {settings.format === 'auto'
              ? 'Auto keeps the original format (falls back to PNG when the browser can’t).'
              : settings.format === 'jpeg'
                ? 'JPEG is universal and compact — adjustable quality below.'
                : settings.format === 'png'
                  ? 'PNG is lossless and keeps transparency.'
                  : 'WebP balances quality and file size, keeps transparency.'}
          </p>
        </div>

        {/* Enhance */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Enhance</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
                <Wand2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                Noise cleanup
              </div>
              <ToggleGroup
                type="single"
                value={String(settings.denoise)}
                onValueChange={(v) => v && setSettings({ denoise: Number(v) as 0 | 1 | 2 })}
                className="w-full gap-1"
              >
                <ToggleGroupItem value="0" aria-label="Noise cleanup off" className="h-7 flex-1 rounded-md border text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10">Off</ToggleGroupItem>
                <ToggleGroupItem value="1" aria-label="Light noise cleanup" className="h-7 flex-1 rounded-md border text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10">Light</ToggleGroupItem>
                <ToggleGroupItem value="2" aria-label="Strong noise cleanup" className="h-7 flex-1 rounded-md border text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10">Strong</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.sharpen}
              onClick={() => setSettings({ sharpen: !settings.sharpen })}
              className={cn(
                'rounded-lg border p-2.5 text-left transition-colors',
                settings.sharpen ? 'border-primary bg-primary/10' : 'hover:bg-muted/40'
              )}
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
                <Sparkles className={cn('h-3.5 w-3.5', settings.sharpen ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                Detail sharpen
              </div>
              <div className={cn('text-[11px]', settings.sharpen ? 'text-primary' : 'text-muted-foreground')}>
                {settings.sharpen ? 'On — crisp edges' : 'Off'}
              </div>
            </button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Noise cleanup removes grain &amp; pixel artifacts before the AI pass; sharpening adds crispness after.
          </p>
        </div>

        {/* JPEG quality */}
        {(settings.format === 'jpeg') && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">JPEG quality</span>
              <span className="font-mono text-xs tabular-nums">
                {Math.round(settings.jpegQuality * 100)}%
              </span>
            </div>
            <Slider
              value={[settings.jpegQuality]}
              min={0.5}
              max={1}
              step={0.01}
              aria-label="JPEG quality"
              onValueChange={([v]) => setSettings({ jpegQuality: v })}
            />
          </div>
        )}

        <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
            Settings apply to newly processed images. Very large outputs are auto-capped at 8192 px per side.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
