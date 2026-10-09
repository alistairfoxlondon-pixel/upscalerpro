'use client';

import * as React from 'react';
import { CloudUpload, ImagePlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/upscaler/store';
import { SAMPLES } from '@/lib/upscaler/utils';

const ACCEPT = 'image/*,.heic,.heif,.hif,.tif,.tiff,.avif,.bmp,.webp';

export function Dropzone() {
  const addFiles = useStore((s) => s.addFiles);
  const addSample = useStore((s) => s.addSample);
  const items = useStore((s) => s.items);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const depth = React.useRef(0);

  const hasItems = items.length > 0;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void addFiles(files);
  };

  // Clipboard paste support
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Add images: click, drag and drop, or paste from clipboard"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card/40 text-center backdrop-blur transition-all outline-none ring-primary/50 focus-visible:ring-2',
        hasItems ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14 sm:py-20',
        dragging
          ? 'pf-drag bg-primary/10 shadow-[0_0_40px_-12px] shadow-primary/40'
          : 'pf-shine border-border/80 hover:border-primary/60 hover:bg-primary/5'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void addFiles(files);
        }}
      />

      <span
        className={cn(
          'flex items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-inner transition-transform group-hover:-translate-y-0.5',
          hasItems ? 'h-10 w-10' : 'h-14 w-14'
        )}
      >
        {dragging ? (
          <ImagePlus className="pf-wiggle h-6 w-6" aria-hidden />
        ) : (
          <CloudUpload className={cn(hasItems ? 'h-5 w-5' : 'h-7 w-7')} aria-hidden />
        )}
      </span>

      <div className="space-y-1">
        <p className={cn('font-semibold tracking-tight', hasItems ? 'text-sm' : 'text-lg')}>
          {dragging ? 'Drop to add images' : hasItems ? 'Add more images' : 'Drop images here'}
        </p>
        <p className="text-xs text-muted-foreground">
          or click to browse · paste with Ctrl/⌘+V · up to 50 files
        </p>
      </div>

      {!hasItems && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          {['JPEG', 'PNG', 'WebP', 'AVIF', 'GIF', 'BMP', 'HEIC', 'TIFF'].map((f) => (
            <span key={f} className="rounded-md border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono">
              {f}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {!hasItems && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">No image handy? Try a sample</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {hasItems && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Samples</span>
          )}
          {SAMPLES.map((s) => (
            <button
              key={s.kind}
              type="button"
              title={s.hint}
              aria-label={`Generate a sample ${s.label.toLowerCase()} image`}
              onClick={() => void addSample(s.kind)}
              className={cn(
                'group/sample inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 font-medium text-foreground/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                hasItems ? 'h-6 px-2 text-[10px]' : 'h-9 px-3 text-xs'
              )}
            >
              <Sparkles className={cn('text-primary/70 transition-colors group-hover/sample:text-primary', hasItems ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
