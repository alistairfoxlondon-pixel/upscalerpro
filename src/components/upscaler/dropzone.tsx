'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MaterialIcon } from './material-icon';
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
        'group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card text-center transition-all outline-none ring-primary/50 focus-visible:ring-2',
        hasItems ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14 sm:py-16',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/60 hover:bg-primary/5'
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
          'flex items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5',
          hasItems ? 'h-10 w-10' : 'h-14 w-14'
        )}
      >
        {dragging ? (
          <MaterialIcon name="add_photo_alternate" filled size={hasItems ? 24 : 30} className="pf-wiggle" />
        ) : (
          <MaterialIcon name="upload" size={hasItems ? 20 : 28} />
        )}
      </span>

      <div className="space-y-1">
        <p className={cn('font-semibold tracking-tight', hasItems ? 'text-sm' : 'text-lg')}>
          {dragging ? 'Drop to add images' : hasItems ? 'Add more images' : 'Drop images here'}
        </p>
        <p className="text-xs text-muted-foreground">
          or click to browse, paste with Ctrl V, up to 50 files
        </p>
      </div>

      <div className="mt-1 flex flex-col items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {hasItems && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Samples</span>
          )}
          {SAMPLES.map((s) => (
            <button
              key={s.kind}
              type="button"
              title={s.hint}
              aria-label={`Generate a sample ${s.label.toLowerCase()} image`}
              onClick={() => void addSample(s.kind)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-background font-medium text-foreground/80 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                hasItems ? 'h-6 px-2 text-[10px]' : 'h-9 px-3 text-xs'
              )}
            >
              <MaterialIcon name="photo" filled size={hasItems ? 13 : 15} className="text-primary" />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
