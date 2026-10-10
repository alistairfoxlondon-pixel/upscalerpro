/** Shared types for Upscaler Pro. Processing happens server side. */

export type EngineChoice = 'standard' | 'ai';
export type ScaleFactor = 2 | 3 | 4 | 8;
export type OutputFormat = 'jpeg' | 'png' | 'webp';
export type FormatChoice = OutputFormat | 'auto';
/** how the output size is chosen: fixed multiplier or a target longest side */
export type ScaleMode = 'factor' | 'target';

export interface Settings {
  engine: EngineChoice;
  scale: ScaleFactor;
  scaleMode: ScaleMode;
  /** target longest side in px (target mode) */
  targetSide: number;
  format: FormatChoice;
  /** encoder quality for jpeg / webp (0.5..1) */
  jpegQuality: number;
  /** 0 = off, 1 = light blur, 2 = strong median (standard engine) */
  denoise: 0 | 1 | 2;
  /** unsharp mask after upscaling */
  sharpen: boolean;
  /** keep camera metadata in JPEG outputs (standard engine) */
  keepExif: boolean;
  queueView: 'list' | 'grid';
  compareMode: 'slider' | 'side';
  compareZoom: number;
}

export interface ResultData {
  url: string;
  size: number;
  w: number;
  h: number;
  ms: number;
  scale: ScaleFactor;
  format: OutputFormat;
  clamped: boolean;
  /** target mode: exact longest side the output was sized to */
  target?: number;
  /** engine that actually produced this result */
  engine: EngineChoice;
  /** AI engine tile count (0 for standard) */
  tiles?: number;
  /** server reduced the requested scale to fit the caps */
  capped?: boolean;
  /** AI skipped because the image exceeded the AI input budget */
  aiFallback?: boolean;
}

export interface QueueItem {
  id: string;
  /** null for items restored from a previous session (original is not kept) */
  file: File | null;
  name: string;
  mime: string;
  sizeIn: number;
  w: number;
  h: number;
  thumbUrl: string;
  originalUrl: string;
  status: 'queued' | 'processing' | 'done' | 'error' | 'canceled';
  progress: number; // 0..1
  phase: string;
  error?: string;
  result?: ResultData;
  /** include in ZIP export (default true) */
  zip?: boolean;
  /** restored from a previous session (original file is gone) */
  restored?: boolean;
  /** true when the input was re-encoded before upload to fit the size cap */
  optimized?: boolean;
  /** transient upload / download rate hint (e.g. "1.2 MB/s") */
  speed?: string;
}
