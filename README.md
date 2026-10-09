# PixelForge

Free AI image upscaler. Enlarge photos up to 8x with sharper detail, right in the browser.

- Server side processing with fast in-memory pipelines, nothing is ever stored
- Factor mode (2x to 8x) or exact target size, downscaling included
- Denoise and sharpen controls, JPEG PNG and WebP output, EXIF opt in
- Batch queue with ZIP export, clipboard paste, compare slider, keyboard shortcuts
- Material 3 inspired interface, light and dark mode, mobile friendly

## Stack

Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, sharp on the server, Zustand.

## Develop

```bash
bun install
bun run dev
```

Open http://localhost:3000.

## Deploy to Vercel

Push the repository, import it in Vercel, deploy. No environment variables required.

Notes:
- Uploads are capped around 4.5 MB per request on Vercel; larger images are optimized in the browser before upload.
- Outputs are capped at 8192 px per side and 34 MP.
- Images live only in function memory and are gone when the response is sent.

## License

MIT
