---
Task ID: 1
Agent: research-agent
Task: Deep audit of open-source browser image upscaling ecosystem

Work Log:
- Queried npm registry API for all candidate @upscalerjs packages (upscaler, esrgan-slim/thick/medium, edsr, espcn, fsrcnn, lapsrn, esrgan, esrgan-legacy, default-model, models, maxim-*, pixel-upsampler); confirmed which exist, versions, licenses, publish dates, unpacked sizes, peer deps
- Downloaded + extracted npm tarballs of upscaler@1.0.0, @upscalerjs/esrgan-slim@1.0.0, @upscalerjs/esrgan-thick@1.0.0, @upscalerjs/esrgan-medium@1.0.0; inspected package.json "exports" maps, dist ESM source (getModelDefinition.js, esrgan.js shared helper, loadModel.browser.js, upscale.js, warmup.js, types.d.ts) and measured actual per-scale weight file sizes in models/x{n}/ folders
- Fetched upscalerjs.com sitemap (69 URLs); read docs pages via page_reader: /documentation/api/execute, /documentation/api/constructor, /documentation/api/upscale, /documentation/getting-started, /documentation/guides/browser/performance/webworker, /performance/patch-sizes, /performance/memory-management, /usage/progress, /usage/custom-model-configurations, /usage/self-hosting-models, /models/available/upscaling/esrgan-slim, /esrgan-thick, /esrgan-medium
- Read READMEs of @upscalerjs/esrgan-legacy (variant export names) and @upscalerjs/default-model (copy of esrgan-slim 2x)
- GitHub page scrape: thekevinscott/UpscalerJS = 901 stars, 84 forks, 1,215 commits, MIT; GitHub API rate-limited so used HTML page
- npm release timeline: 1.0.0-beta series 2022-2023, stable 1.0.0 published 2026-04-27 (all upscaler + model packages shipped same day)
- Web searches: Real-ESRGAN ONNX Runtime Web browser implementations, tfjs WebGL in Web Workers/OffscreenCanvas issues (tfjs#102, tfjs#8267), Chrome canvas/texture size limits, createImageBitmap EXIF orientation, heic2any (npm metadata: 0.0.4, MIT, ~2.6MB), UTIF (3.1.0, MIT, 62KB), browser image format support (caniuse AVIF/JXL/HEIC), onnxruntime-web (1.30.0, MIT)
- Verified upscaler core source: CDN_PATH_DEFINITIONS (jsdelivr first, unpkg fallback), tensorAsBase64 uses document.createElement (breaks in workers), progress callback real signature (amount, slice, sliceData), patch/padding validation rules, Image() string-input loader with crossOrigin='anonymous'

Stage Summary:
- PACKAGE FACTS: `upscaler` v1.0.0 (MIT, published 2026-04-27, ~440KB unpacked) + peerDep `@tensorflow/tfjs` ~4.11.0; model packages @upscalerjs/esrgan-slim / -medium / -thick / -legacy / default-model all v1.0.0 MIT. **@upscalerjs/edsr, -espcn, -fsrcnn, -lapsrn, -esrgan DO NOT EXIST on npm (404)** — that API guess is stale 0.x-era.
- API: `import Upscaler from 'upscaler'; const upscaler = new Upscaler({ model });` — model = default export of `@upscalerjs/esrgan-slim/4x` (a plain ModelDefinition object per scale; 2x/3x/4x/8x subpaths; slim+medium 8x = Node-only). No `.gans()/.psnr()/denoise` functions in v1.0.0 packages (ModelDefinitionFn is deprecated with a warning). esrgan-legacy exports: /gans, /psnr-small, /div2k/2x, /div2k/3x, /div2k/4x.
- `upscaler.execute(input, opts)` === `upscale` (alias). Input: tf.Tensor3D/4D | HTMLImageElement/canvas | string URL (DOM only). Options: output 'base64'|'tensor' (browser default base64, Node default tensor), patchSize, padding (required-if-patchSize else warning; must satisfy padding*2 < patchSize), progress, progressOutput, signal (AbortSignal), awaitNextFrame. Progress real signature v1.0.0: `(amount: number, slice: string|Tensor3D, sliceData: {row, col, patchCoordinates:{origin:[x,y], size:[w,h]}})`; slice format defaults to OPPOSITE of `output` (controllable via progressOutput); tensor slices must be disposed by caller. Docs page narrative "(percent, imageSlice, row, col)" is outdated.
- WEIGHT SIZES (measured from tarballs, weights only incl. model.json): esrgan-slim x2=888KB x3=908KB x4=932KB x8=1112KB; esrgan-medium x2=2744KB x3=2764KB x4=2792KB x8=2968KB; esrgan-thick x2=28480KB x3=28512KB x4=28560KB x8=28884KB (7 shards for 4x). Docs guidance: slim = fastest, browser-intended; medium = balance; thick = best quality but "best suited to Node with GPU, browser with significant latency".
- CDN LOADING: models resolve via _internals {name, version, path: models/x{n}/model.json} → `https://cdn.jsdelivr.net/npm/{name}@{version}/{path}` tried FIRST, then `https://unpkg.com/...` fallback. Self-host: copy models/x4/* to /public and pass `model: { scale: 4, path: '/models/x4/model.json' }` (explicit path bypasses CDN entirely; path is required for custom models). Load path uses tf.loadLayersModel (layers models) / tf.loadGraphModel (graph).
- WORKER GUIDE (upscalerjs.com/documentation/guides/browser/performance/webworker): no HTMLImageElement/document in worker → must pass tensor in and `output: 'tensor'`; UI thread: `const pixels = tf.browser.fromPixels(img); const data = await pixels.data(); worker.postMessage([data, pixels.shape])`; worker: `const tensor = tf.tensor(data, shape); await upscaler.upscale(tensor, { output: 'tensor' })`; send back `[await upscaledImg.data(), upscaledImg.shape]`. Gotcha verified in source: base64 output/progress calls document.createElement('canvas') → throws in worker; string inputs throw too.
- LICENSE/MAINTENANCE: MIT everywhere; GitHub 901 stars / 84 forks; 1.0.0 stable landed 2026-04-27 across all packages (project actively maintained, was in beta 2022-2023).
- ALTERNATIVES: (1) Real-ESRGAN via onnxruntime-web (1.30.0, MIT): real ESRGAN quality (official RealESRGAN_x2plus/x4plus weights converted to ONNX), WebGPU EP fast, WASM CPU fallback slow (~10-60s for 4x on big images); you must hand-roll patching/tiling, weight fetching, alpha handling; reference impls: xororz/web-realesrgan, various client-side tools. (2) UpscalerJS/TF.js: easiest integration, built-in patching/progress/abort/warmup, but models are older/weaker than modern Real-ESRGAN and WebGL backend. (3) Desktop OSS (Upscayl/chaiNNer) not browser-usable. (4) tf.browser.fromPixels-based naive canvas upscale (bicubic) = free baseline. (5) @upscalerjs/maxim-* (0.1.0) = denoise/deblur/restoration at scale 1, complementary not upscaling.
- FORMATS: PNG/JPEG/GIF/BMP/WebP decode natively everywhere; AVIF Chrome 85+/Firefox 93+/Safari 16+; JPEG XL removed from Chrome 2023 but Chrome 145/Firefox 152 restored in 2026, Safari 17+; HEIC: only Safari decodes natively → use heic2any (npm, v0.0.4, MIT, ~2.6MB unpacked, libheif-based, dynamic-import it: heavy); TIFF: no browser support → UTIF.js (v3.1.0, MIT, 62KB).
- GOTCHAS: tfjs WebGL backend works in workers via OffscreenCanvas in Chromium/FF but fails on Safari (tfjs issue #8267) → feature-detect + fallback; WebGL MAX_TEXTURE_SIZE commonly 16384 (Firefox sometimes 8192); canvas limits: Chrome max dimension 32,767px, max area 268,435,456px (16384²), iOS Safari historically 4096×4096/16MP area → cap output size; createImageBitmap defaults imageOrientation:'from-image' (EXIF-respecting) but older Chromium had 'none' default + crop+orientation bugs (crbug 40773069) — decode-then-draw via canvas applies EXIF by default in modern browsers; tf.browser.fromPixels does NOT read EXIF itself; remember pixels.data() returns Float32Array (RGBA), ESRGAN models take RGB [0,255].
- SOURCES: registry.npmjs.org (authoritative package data + tarballs), upscalerjs.com docs (sitemap-derived URLs), github.com/thekevinscott/UpscalerJS, MDN createImageBitmap, caniuse.com, stackoverflow canvas limits, tfjs GitHub issues #102/#8267, xororz/web-realesrgan.

---
Task ID: 2-3
Agent: main-agent (Z.ai Code)
Task: Build PixelForge — free open-source browser-only AI image upscaler (Next.js 16)

Work Log:
- Installed: upscaler@1.0.0, @tensorflow/tfjs@4.11.0, @upscalerjs/esrgan-slim|medium|thick@1.0.0, jszip, heic2any, utif
- Self-hosted weights: public/models/esrgan-slim/{x2,x3,x4} + esrgan-medium/{x2,x3,x4} (~15MB); thick loads from jsDelivr/unpkg on demand
- Core files: src/lib/upscaler/{types,registry,decode,utils,store,worker-client}.ts, src/workers/upscaler.worker.ts, src/types/vendor.d.ts (ambient for model subpaths + utif)
- Worker design: tensor-only I/O (output:'tensor' + progressOutput:'tensor', slices disposed), patchSize 128 / padding 8, webgl→cpu backend fallback, AbortController cancel, serialized task chain, self-hosted model paths override, alpha restore (bilinear-scaled alpha), JPEG flatten-over-white
- Store: zustand queue (add/decode/thumbs/progress/retry/pause/cancel/clear), memory caps (8192px, 34MP output auto-scale-down, 40MP input, 50-file batch), session totals, ZIP export via dynamic jszip
- Decode: createImageBitmap(EXIF-aware) → heic2any (dynamic) → UTIF (dynamic) → <img> fallback
- UI: header/hero/dropzone(paste+drag+sample generator)/settings(preset+scale+format+jpegQ)/queue(batch bar+per-item progress+compare+download+retry)/compare slider+modal/features/faq/oss-credits/footer (sticky mt-auto)
- Theme: next-themes dark default, emerald accent (primary/ring vars), bg-grid, fancy-scroll, icon.svg
- Fixed: tsc ImageData ArrayBufferLike error; tsconfig exclude examples/skills/mini-services (Vercel build safety)

Stage Summary:
- App compiles: eslint 0 problems, tsc 0 errors, dev server ✓ Compiled
- 100% client-side: no API routes, no DB usage — Vercel-ready
- Pending: browser E2E QA (worker boot, WebGL in headless, upscale flow, compare, ZIP, responsive)

---
Task ID: 4
Agent: main-agent (Z.ai Code)
Task: Browser E2E QA + critical bug fixes

Work Log:
- QA via agent-browser: render ✓, sample upscale ✓ (Balanced 4×, 96×72→384×288), batch of 3 ✓, PNG alpha preserved (cornerAlpha=0 verified via canvas readback) ✓, compare modal + real-mouse slider drag (50%→81%) ✓, ZIP export ("ZIP ready — 115.1 KB" toast) ✓, Clear-all-during-job cancel ✓, mobile 390px ✓, light+dark themes ✓, sticky footer ✓
- BUG #1 FIXED: Turbopack serves module workers from blob: URLs → fetch('/models/...') unparsable inside worker. Fix: main thread posts {type:'init', origin}; worker absolutizes self-hosted model paths.
- BUG #2 FIXED (critical): multi-patch jobs (image > patchSize 128) deadlocked forever in tensor.data() on software WebGL (SwiftShader) — kernels enqueued in one giant burst. Fix: `awaitNextFrame: true` in execute → event-loop yield between patches; photo 160×120→640×480 completed (1m46s on SwiftShader; seconds on real GPUs). Progress now flows per patch (49% → Finalizing → Done).
- HARDENING: 240s stall watchdog in store (resets on any worker message for the job) → auto-cancel + ONE retry with backendHint:'cpu' (pure-JS tfjs backend, model cache keyed per backend); second stall → clear error message. Stale done/error messages guarded via pending-map (prevents re-queued items being clobbered by cancel errors).
- UX: phase 'Finalizing' when rate≥0.999; 'Upscaling' immediately after cached-model ready; error toasts via sonner; placeholder result cleared on error (was leaking fake Compare/Download buttons).
- Tooling: tsconfig excludes examples/skills/mini-services (clean Vercel typecheck); debug channel worker→main (`[pf-worker]` console) kept for future support.

Stage Summary:
- PixelForge fully functional & QA-verified end-to-end in browser (dark/light, desktop/mobile)
- eslint 0 problems · tsc 0 errors · dev.log clean
- Vercel-ready: 100% client-side, no APIs, no DB, weights self-hosted in public/models (~15MB) + CDN fallback for Studio (~29MB)
- Known limits (documented in FAQ): 8192px/34MP output cap, 40MP input cap, 50-file batch, software-GL slowness (headless CI)
