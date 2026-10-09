import type { WorkerInMessage, WorkerOutMessage } from './types';

type Listener = (m: WorkerOutMessage) => void;

let worker: Worker | null = null;
const listeners = new Set<Listener>();

export function onWorkerMessage(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Lazily spins up the upscaling worker (heavy TF.js bundle stays out of the main chunk). */
export function getWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('../../workers/upscaler.worker.ts', import.meta.url), {
      type: 'module',
    });
    // Bundlers may serve module workers from blob: URLs where relative paths
    // are unresolvable — give the worker an explicit origin for model weights.
    worker.postMessage({ type: 'init', origin: self.location.origin });
    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      for (const l of listeners) l(e.data);
    };
    worker.onerror = (e) => {
      console.error('[pixelforge] worker error', e.message);
    };
  }
  return worker;
}

export function postToWorker(msg: WorkerInMessage, transfer?: Transferable[]) {
  const w = getWorker();
  if (!w) return;
  if (transfer) w.postMessage(msg, transfer);
  else w.postMessage(msg);
}

/**
 * Hard-resets the worker (e.g. after a GPU readback stall). A hung task would
 * otherwise block the worker's internal job chain forever; terminating gives
 * every queued item a clean slate — models reload on demand.
 */
export function resetWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
