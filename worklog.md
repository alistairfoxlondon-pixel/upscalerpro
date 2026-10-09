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

---
Task ID: 5
Agent: cron-review-agent (round 2)
Task: QA re-check, enhance features, persistence, PWA, styling detail pass

Work Log:
- QA re-check: tsc/lint clean, page renders error-free; established the app was stable before feature work.
- FEATURE: Enhance controls in settings — "Noise cleanup" (Off/Light/Strong = 1-2× 3×3 median pre-pass on ImageData before the AI call) and "Detail sharpen" (thresholded unsharp-mask post-pass on upscaled RGBA). Implemented in worker (typed-array passes, alpha untouched, debug timings); wired through Settings/WorkerRequest; new worker→main `{type:'phase'}` messages give live "Cleaning noise" / "Sharpening" phases. Verified in browser: "denoise x2 8ms" debug line, job Done 18.9s with both passes active, ZIP export ok.
- Evaluated + REJECTED @upscalerjs/maxim-denoising: 113 MB fp32 weights — impractical for browser; uninstalled.
- BUG #3 FIXED: stall watchdog cancel could not unblock the worker's serialized chain when a GPU readback wedged AFTER execute completed (data() has no abort signal) — the CPU retry never started and timed out. Fix: onStall now terminates & respawns the worker (resetWorker in worker-client; fresh worker re-receives origin init) and requeues the item once with backendHint:'cpu'; second stall → clear actionable error. Verified: watchdog fired → requeue happened (CPU retry path exercised; SwiftShader CPU too slow for medium → clean final error message, exactly as designed).
- STALL_TIMEOUT raised 240s→300s (avoids false positives during slow Studio downloads / slow legit reads).
- FEATURE: settings persistence — zustand persist ('pixelforge-settings', partialize→settings only, skipHydration + manual rehydrate in Workspace useEffect, merge sanitizes with DEFAULT_SETTINGS). Verified: engine/scale/format/denoise/sharpen survive reload.
- FEATURE: PWA-lite — public/manifest.webmanifest + icon-192/512.png (PIL-generated), sw.js (cache-first /models/* → true offline models; cache-first hashed assets; network-first documents; prod-only registration via PwaRegister). Manifest + appleWebApp meta wired in layout.
- STYLING: per-item SVG progress ring around thumbnails (+ blur/dim on thumb while processing), barber-pole stripes on active progress bars (.pf-stripes), animated conic-gradient border on dropzone drag (.pf-drag), count-up animation on session stats, queue item hover elevation + done-state animate-in, "local only" chip in session card.
- FAQ updated (enhance + settings-memory answers); features copy unchanged.

Stage Summary:
- eslint 0 · tsc 0 · fresh page load: zero console errors · all QA flows green (enhanced sample, compare modal, ZIP)
- New capabilities this round: noise cleanup, detail sharpening, remembered settings, installable/offline-capable PWA shell, richer processing UI
- Recovery stack now: awaitNextFrame (queue-depth fix) → phase messages → 300s stall watchdog → worker restart + CPU retry → clear error with guidance
- Risks/next: CPU fallback is very slow on huge images (documented in error copy); Studio (29MB) first-load UX could use a download progress bar (tfjs loadLayersModel has no progress hook without patching); compare-modal zoom/pan still open as a future nicety; consider IndexedDB model caching if SW cache eviction becomes an issue.

---
Task ID: 6
Agent: cron-review-agent (round 3)
Task: QA assessment, 8× upscale feature, compare zoom & pan, styling detail pass

Work Log:
- QA first: page render ✓, 4× sample flow ✓ (18.6s SwiftShader), compare modal ✓, settings persistence ✓ (Fast/Strong-denoise/Sharpen survived reload), console clean. App was stable → proceeded to feature work per mandate.
- BUG #4 FIXED (pre-existing): queue Compare/Download buttons rendered during processing from the placeholder result object — clicking Compare opened nothing, Download would fetch('') . Buttons now gated on `item.status === 'done'`.
- BUG #5 FIXED (pre-existing): idle Pause/Resume button showed a disabled "Resume" when nothing was paused. Pause shows only when busy&&!paused; Resume only when paused.
- BUG #6 FIXED (new-code bug caught immediately): leftover pre-loop getModel(preset, scale) threw 'Unknown model configuration fast:8' — removed; per-pass getModel in the chain loop is the only loader now.
- FEATURE: 8× upscale via chained 4×→2× passes in the worker (no new weights; reuses self-hosted slim/medium + CDN thick). ScaleFactor 2|3|4|8; resolveScale tries [requested,4,3,2] against 8192px/34MP caps (8× needs input ≲0.5MP, auto-drops to 4× otherwise). Per-pass progress mapping (pass1≈22%, pass2≈77%); all chain tensors tracked + disposed in finally; final output excluded from tracked (disposed after data readback). Verified in browser: pass 4x →384×288, pass 2x →768×576 (96×72 sample, Fast).
- FEATURE: strip-wise final readback — out.data() split into ≤8 horizontal slices with 'Finalizing N%' phase ticks: keeps the stall watchdog fed during big GPU readbacks (previously a silent 95% freeze for the whole readback; could false-trigger the 300s watchdog on slow GPUs).
- FEATURE: Compare modal zoom & pan — wheel zoom toward cursor (1–6×, non-passive listener), drag-to-pan when zoomed (cursor grab/grabbing, touch-action gated), divider grab pad lives INSIDE the transformed stage (counter-scaled width 24/zoom px) so it stays glued to the reveal edge while panning; floating controls (−/percent/Fit-or-2×/+), keyboard +/−/0/f, Home/End/Arrows unchanged; state resets per image pair. Verified: 196% zoom render, pan matrix(1.96,0,0,1.96,-140,20), reset → identity. (First pan attempt "failed" only because the pointer started exactly on the divider pad — it performed a legit divider drag; off-pad drag pans.)
- STYLING: hero gets two slow-drifting ambient orbs + shimmer sweep on the gradient headline + chip hover polish; dropzone shine-sweep on hover (mutually exclusive with pf-drag ring — overflow:hidden would clip the conic ring) + icon wiggle while dragging; queue rows staggered pf-rise entrance (--i based, capped 12) + hover lift + pf-pop on Done badge; Features/FAQ headers get eyebrow pill with gradient rule lines; features headline rewritten ('Cloud-quality upscaling, without the cloud').
- MOTION: global prefers-reduced-motion guard kills all pf-* animations (stripes, drag ring, orbs, shimmer, rise, pop, wiggle, breathe).
- COPY: hero 'up to 8× sharper'; FAQ size-limit answer covers 8× (~0.5MP source guidance); settings 8× button has MAX badge + title tooltip + hint line '8× chains two AI passes (4× → 2×)…'.
- CLEANUP: redundant ternary in queue meta line.

Stage Summary:
- eslint 0 problems · tsc 0 errors · dev.log clean · fresh-page console clean
- Browser-verified: 8× chain (96×72→768×576), 4× regression, zoom/pan/reset in compare modal, light+dark themes, idle batch-bar buttons, session stats
- SwiftShader note: 8× output readback is slow in headless/software-GL (~2–3 min for 442k px) but now ticks 'Finalizing N%' and feeds the watchdog; real GPUs are ms-fast
- Risks/next: pin two-finger pinch-zoom in compare (buttons only today); 8× on Studio = two 29MB models in VRAM (works, but consider a warning when preset=studio+scale=8); Optional: remember compare-zoom preference

---
Task ID: 7
Agent: cron-review-agent (round 4)
Task: Status assessment + agent-browser QA, then feature/styling expansion (pinch zoom, clipboard, share, GPU tooltip, toasts)

Work Log:
- ASSESSMENT: worklog reviewed; page render ✓, zero console errors, Fast 4× sample E2E ✓ (96×72→384×288, ~19s SwiftShader), compare modal ✓, settings persistence ✓. Suspected hero a11y bug ("tocrytal clarity") verified FALSE — DOM has the space (Playwright snapshot artifact).
- FEATURE: pinch-zoom in CompareSlider — multi-pointer Map + gesture-origin refs; zoom = distance ratio (clamped 1–6×), focal anchoring keeps the initial midpoint's content under the live midpoint (pan = mid − center − k·(startMid − center − startPan)); container now touch-none always (pinch + touch-divider both need it); one finger lifting after pinch continues as pan when zoomed. Verified via synthetic PointerEvents: spread 40%→64% = exactly scale(1.6); off-center pinch → translate(115.5px) scale(2) anchored to focal point; divider drag regression ✓ (50→75).
- BUG #7 FIXED (robustness): setPointerCapture throws NotFoundError for inactive/synthetic pointer ids, aborting the handler before mode was set in beginGesture (divider-pad path). Both capture sites now wrapped in try/catch (best-effort). Dev-overlay 3× NotFoundError cleared; re-tested → zero new issues.
- FEATURE: batch-complete toast — ensureLoop counts completions; on natural end (not paused) toasts "N images ready / Processed entirely on this device." with a 10s "Download ZIP" action button. Verified in browser.
- FEATURE: copy-to-clipboard — copyImageToClipboard() in utils (fetch blob → PNG-reencode via canvas when type≠png → ClipboardItem); Copy buttons on done queue rows + compare-modal footer, success/error toasts. Verified: success toast, no error path.
- FEATURE: Web Share on compare modal — File + navigator.canShare({files}) gate; Share button renders only when supported (hidden on desktop headless as expected; appears on mobile).
- FEATURE: Engine GPU tooltip — worker reads WEBGL_debug_renderer_info via tf backend's gpgpu.gl (BUG #8: first attempt used renderer.gl/gl which don't exist in tfjs 4.11 — fixed after inspecting backend_webgl.js dist). Badge now tooltips e.g. "GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader…))".
- FEATURE: Studio+8× combined warning in settings (amber box: two ~29 MB models, Fast/Balanced safer for 8×).
- HARDENING: readback strips now target ~64px (was 256px) — a 288px-tall output reads back in 4 strips with Finalizing % ticks instead of 1 silent giant readPixels call; strips feed the stall watchdog via phase handler.
- STYLING: FAQ accordion triggers get rounded hover pill (px-3, hover:bg-muted/40, no-underline); session card gains "Avg / image" row; batch bar tints amber when paused+busy; compare-modal footer regridded (2-col mobile grid → sm:flex right-aligned); mobile/desktop hint duplication fixed (slider hint sm:hidden, modal hint hidden sm:block); mobile hint text now "Pinch to zoom · drag to pan when zoomed".
- VERIFIED: watchdog recovery re-confirmed twice with new code (SwiftShader readback wedge → 300s watchdog → worker restart → CPU retry → Done; result 96×72→384×288, 12.4 KB); mobile 390px modal + grid buttons ✓; light+dark themes ✓; GPU tooltip ✓; batch toast ✓.
- NOTE: a "stuck Loading model" scare turned out to be a stale Turbopack worker chunk after HMR — fixed by fresh browser session; not a code bug (dev.log compiles stayed clean).

Stage Summary:
- eslint 0 problems · tsc 0 errors · dev.log clean · zero new dev-overlay issues
- New this round: two-finger pinch zoom with focal anchoring, clipboard copy everywhere, Web Share (mobile), GPU name tooltip, batch-complete toast with ZIP shortcut, Studio+8× memory warning, finer readback feedback
- Recovery stack unchanged: awaitNextFrame → phase messages → 300s watchdog → worker restart + CPU retry → clear error (re-verified end-to-end twice this round)
- Risks/next: SwiftShader readback wedge remains environmental (real GPUs unaffected); consider IndexedDB model cache; remember compare-zoom preference; optional EXIF-preserving JPEG export
