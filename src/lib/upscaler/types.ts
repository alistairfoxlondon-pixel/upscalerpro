/** Structural subset of UpscalerJS ModelDefinition (v1.0.x). */
export interface ModelDefinition {
  scale?: number;
  modelType?: 'layers' | 'graph';
  path?: string;
  _internals?: { path: string; name: string; version: string };
  setup?: (tf: unknown) => void | Promise<void>;
  meta?: Record<string, unknown>;
}

export type PresetId = 'fast' | 'balanced' | 'studio';
export type ScaleFactor = 2 | 3 | 4 | 8;
export type OutputFormat = 'jpeg' | 'png' | 'webp';
export type FormatChoice = OutputFormat | 'auto';

export interface PresetMeta {
  id: PresetId;
  label: string;
  model: string;
  sizeMB: number;
  desc: string;
  speed: 1 | 2 | 3; // 3 = fastest
  quality: 1 | 2 | 3; // 3 = best
}

export interface WorkerRequest {
  type: 'upscale';
  id: string;
  bitmap: ImageBitmap;
  scale: ScaleFactor;
  preset: PresetId;
  format: OutputFormat;
  quality: number;
  /** 0 = off, 1 = light median pre-pass, 2 = strong (two passes) */
  denoise: 0 | 1 | 2;
  /** unsharp-mask post-pass on the upscaled output */
  sharpen: boolean;
  /** force a specific tfjs backend (used by the stall watchdog to retry on CPU) */
  backendHint?: 'webgl' | 'cpu';
}

export type WorkerInMessage =
  | { type: 'init'; origin: string }
  | WorkerRequest
  | { type: 'cancel'; id: string };

export type ModelStatus = 'loading' | 'ready' | 'error';

export type WorkerOutMessage =
  | { type: 'backend'; backend: string }
  | { type: 'debug'; text: string }
  | { type: 'phase'; id: string; phase: string }
  | { type: 'model-status'; preset: PresetId; scale: ScaleFactor; status: ModelStatus; message?: string }
  | { type: 'progress'; id: string; rate: number }
  | { type: 'done'; id: string; blob: Blob; width: number; height: number; ms: number }
  | { type: 'error'; id: string; message: string };
