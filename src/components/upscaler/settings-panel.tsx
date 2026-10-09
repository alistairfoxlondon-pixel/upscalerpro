'use client';

import * as React from 'react';
import { Zap, Gauge, Crown, AlertTriangle, Check } from 'lucide-react';
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
                aria-label={`${s} times upscale`}
                className="flex-1 rounded-lg border font-mono text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10"
              >
                {s}×
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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
