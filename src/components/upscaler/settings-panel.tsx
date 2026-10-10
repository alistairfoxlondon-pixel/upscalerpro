'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MaterialIcon } from './material-icon';
import { AI_INPUT_MAX_SIDE, SCALES, TARGET_MAX, TARGET_MIN, TARGET_PRESETS } from '@/lib/upscaler/registry';
import { useStore } from '@/lib/upscaler/store';
import type { EngineChoice, FormatChoice, ScaleFactor } from '@/lib/upscaler/types';
import { cn } from '@/lib/utils';

const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

function SectionLabel({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <MaterialIcon name={icon} size={16} className="text-primary" />
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
      {children}
    </span>
  );
}

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const isTarget = settings.scaleMode === 'target';
  const targetValid = settings.targetSide >= TARGET_MIN && settings.targetSide <= TARGET_MAX;

  const commitTarget = (raw: number) => {
    const side = Math.round(raw);
    setSettings({ targetSide: Math.min(TARGET_MAX, Math.max(TARGET_MIN, side)) });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          Settings
          <Badge variant="outline" className="gap-1 font-mono text-[10px] text-muted-foreground">
            <MaterialIcon
              name={settings.engine === 'ai' ? 'neurology' : settings.engine === 'glm' ? 'psychology' : 'speed'}
              size={12}
            />
            {settings.engine === 'ai' ? 'AI Detail' : settings.engine === 'glm' ? 'GLM' : 'Standard'} ·{' '}
            {isTarget ? `${settings.targetSide}px` : `${settings.scale}x`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Engine */}
        <div className="space-y-2">
          <SectionLabel icon="memory">Engine</SectionLabel>
          <ToggleGroup
            type="single"
            value={settings.engine}
            onValueChange={(v) => v && setSettings({ engine: v as EngineChoice })}
            className="w-full gap-1.5"
          >
            <ToggleGroupItem
              value="standard"
              aria-label="Standard engine, fast resampling"
              className="flex-1 flex-col gap-0.5 rounded-md border px-1 py-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
            >
              <MaterialIcon name="speed" size={18} className="text-primary" />
              Standard
            </ToggleGroupItem>
            <ToggleGroupItem
              value="ai"
              aria-label="AI engine, Real-ESRGAN detail reconstruction"
              className="flex-1 flex-col gap-0.5 rounded-md border px-1 py-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
            >
              <MaterialIcon name="neurology" size={18} className="text-primary" />
              AI Detail
            </ToggleGroupItem>
            <ToggleGroupItem
              value="glm"
              aria-label="GLM engine, generative enhancement"
              className="flex-1 flex-col gap-0.5 rounded-md border px-1 py-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
            >
              <MaterialIcon name="psychology" size={18} className="text-primary" />
              GLM AI
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {settings.engine === 'ai'
              ? `Neural detail up to 4x native. Input max ${AI_INPUT_MAX_SIDE} px, larger photos use Standard.`
              : settings.engine === 'glm'
                ? 'Generative enhancement through GLM. Any input size, slower, declare as AI content on Adobe Stock.'
                : 'Fast multi pass resampling with edge sharpening. Best for large photos and batches.'}
          </p>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <SectionLabel icon="photo_size_select_large">Size</SectionLabel>
          <ToggleGroup
            type="single"
            value={settings.scaleMode}
            onValueChange={(v) => v && setSettings({ scaleMode: v as 'factor' | 'target' })}
            className="w-full gap-1.5"
          >
            <ToggleGroupItem
              value="factor"
              aria-label="Multiply by a factor"
              className="h-8 flex-1 rounded-md border text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
            >
              Factor
            </ToggleGroupItem>
            <ToggleGroupItem
              value="target"
              aria-label="Exact target size"
              className="h-8 flex-1 rounded-md border text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
            >
              Target
            </ToggleGroupItem>
          </ToggleGroup>

          {isTarget ? (
            <>
              <ToggleGroup
                type="single"
                value={TARGET_PRESETS.some((t) => t.side === settings.targetSide) ? String(settings.targetSide) : ''}
                onValueChange={(v) => v && commitTarget(Number(v))}
                className="w-full gap-1.5"
              >
                {TARGET_PRESETS.map((t) => (
                  <ToggleGroupItem
                    key={t.side}
                    value={String(t.side)}
                    aria-label={`Target ${t.label}, ${t.side} pixels`}
                    className="flex-1 flex-col gap-0 rounded-md border px-1 py-1.5 data-[state=on]:border-primary data-[state=on]:bg-primary/10"
                  >
                    <span className="font-mono text-xs leading-tight">{t.side}px</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.label}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div
                className={cn(
                  'flex h-9 items-center rounded-md border bg-background pl-2.5 transition-colors focus-within:ring-2 focus-within:ring-primary/50',
                  targetValid ? 'border-border' : 'border-destructive'
                )}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={TARGET_MIN}
                  max={TARGET_MAX}
                  step={80}
                  value={settings.targetSide}
                  aria-label="Custom target size, longest side in pixels"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setSettings({ targetSide: Math.min(TARGET_MAX, Math.max(0, Math.round(v))) });
                  }}
                  onBlur={(e) => commitTarget(Number(e.target.value))}
                  className="h-full w-full bg-transparent font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="pr-2.5 font-mono text-[10px] text-muted-foreground">px side</span>
              </div>
              {!targetValid && (
                <p className="text-[11px] text-destructive">
                  Pick {TARGET_MIN} to {TARGET_MAX} px.
                </p>
              )}
            </>
          ) : (
            <>
              <ToggleGroup
                type="single"
                value={String(settings.scale)}
                onValueChange={(v) => v && setSettings({ scale: Number(v) as ScaleFactor })}
                className="w-full gap-1.5"
              >
                {SCALES.map((s) => (
                  <ToggleGroupItem
                    key={s}
                    value={String(s)}
                    aria-label={`${s} times upscale`}
                    className="flex-1 rounded-md border py-1.5 font-mono text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10"
                  >
                    {s}x
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                {settings.scale}x = {settings.scale * settings.scale}x more pixels.
                {settings.engine === 'ai' && settings.scale > 4
                  ? ' AI works at 4x, then resamples to your factor.'
                  : ''}
              </p>
            </>
          )}
        </div>

        {/* Format */}
        <div className="space-y-2">
          <SectionLabel icon="image">Format</SectionLabel>
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
                className="h-8 flex-1 rounded-md border text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10"
              >
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Enhance */}
        <div className="space-y-2">
          <SectionLabel icon="tune">Enhance</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
                <MaterialIcon name="blur_on" size={15} className="text-primary" />
                Denoise
              </div>
              <ToggleGroup
                type="single"
                value={String(settings.denoise)}
                onValueChange={(v) => v && setSettings({ denoise: Number(v) as 0 | 1 | 2 })}
                className="w-full gap-1"
              >
                <ToggleGroupItem value="0" aria-label="Denoise off" className="h-7 flex-1 rounded-sm border text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10">Off</ToggleGroupItem>
                <ToggleGroupItem value="1" aria-label="Light denoise" className="h-7 flex-1 rounded-sm border text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10">Light</ToggleGroupItem>
                <ToggleGroupItem value="2" aria-label="Strong denoise" className="h-7 flex-1 rounded-sm border text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary/10">Strong</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.sharpen}
              onClick={() => setSettings({ sharpen: !settings.sharpen })}
              className={cn(
                'rounded-md border p-2.5 text-left transition-colors',
                settings.sharpen ? 'border-primary bg-primary/10' : 'hover:bg-muted'
              )}
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
                <MaterialIcon
                  name="deblur"
                  size={15}
                  filled={settings.sharpen}
                  className={settings.sharpen ? 'text-primary' : 'text-muted-foreground'}
                />
                Sharpen
              </div>
              <div className={cn('text-[11px]', settings.sharpen ? 'text-primary' : 'text-muted-foreground')}>
                {settings.sharpen ? 'On' : 'Off'}
              </div>
            </button>
          </div>
          {settings.engine === 'ai' && settings.denoise > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <MaterialIcon name="info" size={13} className="mt-px shrink-0" />
              AI handles noise itself. Denoise applies to Standard.
            </p>
          )}
        </div>

        {/* Quality for jpeg / webp */}
        {(settings.format === 'jpeg' || settings.format === 'webp') && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {settings.format === 'jpeg' ? 'JPEG' : 'WebP'} quality
              </span>
              <span className="font-mono text-xs tabular-nums">
                {Math.round(settings.jpegQuality * 100)}%
              </span>
            </div>
            <Slider
              value={[settings.jpegQuality]}
              min={0.5}
              max={1}
              step={0.01}
              aria-label={`${settings.format === 'jpeg' ? 'JPEG' : 'WebP'} quality`}
              onValueChange={([v]) => setSettings({ jpegQuality: v })}
            />
          </div>
        )}

        {/* EXIF */}
        {settings.format === 'jpeg' && (
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-md border p-2.5 transition-colors',
              settings.keepExif ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted'
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <MaterialIcon name="photo_camera" size={15} className={settings.keepExif ? 'text-primary' : 'text-muted-foreground'} />
                Keep EXIF
              </p>
              <p className="text-[10px] text-muted-foreground">Standard engine, JPEG only.</p>
            </div>
            <Switch
              checked={settings.keepExif}
              onCheckedChange={(v) => setSettings({ keepExif: v })}
              aria-label="Keep EXIF metadata in JPEG outputs"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-[11px] text-secondary-foreground">
          <MaterialIcon name="cloud_done" size={14} className="shrink-0 text-primary" />
          Outputs capped at 8192 px per side. Nothing stored.
        </div>
      </CardContent>
    </Card>
  );
}
