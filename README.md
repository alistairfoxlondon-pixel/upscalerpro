# Upscaler Pro

Free AI image upscaler. Enlarge images up to 8x with real reconstructed detail, processed on the server.

- Two engines: Standard (multi pass Lanczos with tuned unsharp masking) and AI Detail (Real-ESRGAN realesr general x4 v3 via ONNX Runtime)
- Factor mode (2x to 8x) or exact target size, downscaling included
- Every result shows exactly what was applied: engine, scale, output size, file size and time
- Live before and after compare slider with zoom, side by side mode included
- Batch queue with ZIP export, clipboard paste, keyboard shortcuts
- Material 3 inspired interface with Google Material Symbols icons, light and dark mode, mobile friendly
- Files are processed in memory and never stored: nothing is written to disk and nothing survives the response

## Stack

Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, sharp, ONNX Runtime, Real-ESRGAN, Zustand.

## The AI engine

The AI engine runs the compact Real-ESRGAN general model (SRVGGNetCompact, 1.25M parameters) on the server with ONNX Runtime CPU. Inputs above 384 px are processed in square overlapping tiles with feathered blending, so seams stay invisible and memory stays low. The 4x native output is then resampled to the requested factor. Images longer than 1280 px on the long side fall back to the Standard engine with a clear notice.

## Develop

```bash
bun install
bun run dev
```

Open http://localhost:3000.

## Deploy to Vercel

Push the repository, import it in Vercel, deploy. No environment variables required.

Notes:
- Uploads are capped around 4.5 MB per request on Vercel; larger images are optimized in the browser and retried automatically.
- Outputs are capped at 8192 px per side and 34 MP.
- The ONNX model ships inside the function bundle via output file tracing.
- Images live only in function memory and are gone when the response is sent.

## License

MIT. Real-ESRGAN is BSD 3 Clause, libvips and sharp are LGPL 3. Model weights: realesr general x4 v3 by the Real-ESRGAN authors.
