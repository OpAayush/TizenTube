# axotube — Research & Future Plans

> Working repo: `C:\TDP\axotube` (fork of TizenTube, target: `https://github.com/OpAayush/axotube`)
> Source in `mods/`, build output `dist/userScript.js` (single minified file, built with `npm run build` in `mods/`).
> Today's date: 2026-08-01

---

## 0. Bundle size reduction (DONE — core-js removed)

Goal: improve script loading time + reduce size. Result: **dist/userScript.js 734,360 → 525,396 bytes (−28.5%, ~209KB saved)**. Build time dropped from ~21s → 9.5s.

### What was done

- Removed `import 'core-js/stable'` from `mods/userScript.js` (was ~209KB of blanket polyfills; Tizen 4's Chromium 47 already natively has Array.includes/find/findIndex, Symbol, Map/Set, Object.assign, Promise, String.includes, etc.).
- Hand-wrote tiny ES5 polyfills in `mods/polyfills.js` for the actual remaining Chrome-47 gaps:
  - `Object.entries` / `Object.values` (used by moreSubtitles.js, enableFeatures.js, pictureInPicture.js, preferredVideoQuality.js).
  - (URLSearchParams is NOT needed — whatwg-fetch's use is fully guarded by its `support.searchParams` capability check.)
  - (Reflect.construct in customUI.js is already guarded `typeof Reflect.construct === 'function'` with a fallback — no polyfill needed.)
- Replaced `new URL(location.hash.substring(1), location.href)` in `mods/features/sponsorblock.js:491` with `const match = /[?&]v=([^&]+)/.exec(location.hash); const videoID = match ? match[1] : null;` (Chrome 47 lacks `URL`; this was the only usage).
- Updated `mods/userScript.js` header comment to reflect new import order (polyfills.js → whatwg-fetch → app modules).
- `core-js/web/url` was measured but REJECTED (it drags in ~52KB of URL+URLSearchParams machinery; hand-written approaches are far smaller).

### Verified

- Smoke test (`node smoke-test.js` at repo root): all 8 assertions PASS after the change.
- Bundle syntax OK (`new Function` check).
- One harness gotcha: core-js/stable was defining `self` as a side effect; the smoke test now sets `global.self = globalThis` (line 54). On real Cobalt `self` is a native browser global so no runtime impact.

### Size measurement infra

Probe scripts live in `C:\Users\Asus\AppData\Local\Temp\opencode\probe-sizes.js` (measures bundle sizes by writing a temp `_size_probe.js` input and using `rollup.rollup` + `generate`), `probe-check.js`, `probe-edit.js`. Key measured numbers: core-js/stable alone 209,087 B; polyfills.js alone 4,984 B; whatwg-fetch alone 9,945 B; targeted core-js set 68,561 B; LEAN core-js with web/url 67,606 B; i18next+translations ≈ 182 KB; ui.js tree ≈ 124 KB; remaining app modules ≈ 192 KB.

### Remaining size targets (not yet done)

- translations + i18next ≈ 182 KB (biggest remaining chunk; i18next dist/cjs/i18next.js is 81,740 B, uses only 1x Array.includes + 1 for-of so it's Chrome-47-safe; translations/language-names.js etc.)
- ui.css (46,177 B raw, inlined via string plugin) and the ui.js tree ≈ 124 KB.

---

## 1. Perf / scroll-lag work (DONE)

Audit of hot-path code (`mods/features/adblock.js`) that runs on every response parse. All landed and verified by a smoke test:

- **Config recursion crash FIXED** (real pre-existing bug): `configRead()`'s populate path used the *patched* `JSON.parse` → wrapper → `configRead` → infinite recursion → `RangeError: Maximum call stack size exceeded` on the first browse parse whenever the stored config misses a key. Fixed in `mods/config.js` by capturing native JSON at module top (`nativeJSONParse`/`nativeJSONStringify`) and using them in `initConfig`, `tryPersistConfig`, and the `configRead` populate path.
- Removed leftover debug `console.log(r.playbackContext.contentPlaybackContext)` from the JSON.parse wrapper (was logging a huge object on every player response).
- `addPreviews`: moved both `onFocusCommand` guards *before* the expensive `JSON.parse(JSON.stringify(watchEndpoint))` deep copy.
- `processShelves`: backward-splice, hoisted `configRead`s, shorts-check-first.
- `deArrowify`: promise-per-videoID cache (`deArrowCache`).
- `hqify`: memo with identity check (`hqThumbnailsCache`) so re-processed shelves are skipped.
- `makeQueuePayload`: compact tile (only contentType/style/contentId/trackingParams + deep copies of metadata/header/onSelectCommand; no onFocusCommand/onLongPressCommand inside).
- `hideVideo`: hoisted config reads.
- JSON.stringify wrapper: single-pass in-place mutation (sets `isInlinePlaybackNoAd` on `value.playbackContext.contentPlaybackContext`, then calls orig once). Idempotent.

### Smoke test

`smoke-test.js` at repo root (copied from temp harness). Drives the real built bundle with DOM/TV stubs; 8 assertions all pass. Stub gotchas documented in the file:

- `window.JSON: JSON` must be stubbed before `require(BUNDLE)`; capture natives first.
- localStorage stub must sync bracket property `localStorageStub[CONFIG_KEY]`.
- All config keys read during parses must be in the initial `setConfig` (before require) — `configRead` caches from `localConfig` initialized at bundle load.
- `global.location = { hash: '#/' }` (with the `#`) or `hideVideo`'s pageName is empty.
- Fixture tiles need `lines[0].lineRenderer.items[0].lineItemRenderer.text.runs[0].text` subtitle or `addLongPress` skips.
- fetch-count assertion: first parse legitimately fetches 3 distinct videos, cache prevents re-fetch.

Run: `node smoke-test.js`

**TV-side note:** the TV's stored localStorage still has `enableHqThumbnails:false` (old default). User must toggle Settings → Misc → HQ Thumbnails once on the TV to pick up the new default (`true`).

---

## 2. Boot screen: keep native YouTube loader until axotube loads (DONE)

User request: *"is it possible to keep user waiting at YOUTUBE loading screen until axotube is loaded?"* and *"i would like native youtube loader to stay/slow down/pause until mine loads"*.

User rejected a branded custom overlay (`bootScreen.js` idea). Wants the **native** loader held on screen.

### Implementation (mods/ui/bootLoader.js)

- Captures a snapshot of the native splash (`#loader`) into a fixed full-screen `#ytaf-boot-overlay` (z-index top) as soon as it appears; retries the grab at 50/200/800/2000ms via MutationObserver watch.
- Holds the overlay until `window.__releaseBootLoader` is called (ui.js `execute_once_dom_loaded`), with a 10s auto-release safety timeout.
- Kept native loader, no custom branding, matches the user's rejection of `bootScreen.js`.

---

## 3. Force 1440p/4K on a 1080p screen (RESEARCHED; plan in progress)

### User-visible symptoms

- Selecting 1440p in settings does nothing — every video caps at 1080p.
- At 1080p, two format codes exist: **itag 399 (AV1) = 19.77 MiB** and **itag 137 (H264) = 32.17 MiB**, same framerate. AV1 is heavily compressed; H264 carries far more data.
- Codec selection in settings **does** work on the real TV (confirmed by user) — proving the `/player` response does flow through the patched `JSON.parse` on real Cobalt.

### Protocol findings (Playwright, Tizen 4.0 UA, logged in)

- Test video used: `https://www.youtube.com/tv#/watch?v=Eo5w2S-h5dI`.
- Playwright quirk: the TV page lives in a **separate context** created with `newContext({userAgent, viewport 1920x1080})`. Snapshot/network/console MCP tools don't see it; everything goes through `playwright_browser_run_code_unsafe`, targeting `page.context().browser().contexts().flatMap(c => c.pages()).find(p => p.url().includes('youtube.com'))`.
- The TV client **never hits `/youtubei/v1/player`**. Flow: `/youtubei/v1/next` (JSON, has `context.client.screenWidthPoints/HeightPoints` and `watchEndpointSupportedOnesieConfig.html5PlaybackOnesieConfig.commonConfig.url` = googlevideo `initplayback?...&id=<hex>`) → binary protobuf POST to `https://rr*.googlevideo.com/videoplayback?...` → ~1MB binary `application/vnd.yt-ump` manifest (the onesie/UMP protocol) containing all formats.
- The onesie **request** itag list already advertises up to 4K: `[1,2,5,6,8,16,42,133,134,135,136,137,140,160,168,242,243,244,247,248,249,250,251,271,278,313,394,395,396,397,398,399,400,401,544,576,1000,1080,1200]` (includes VP9 1440p=271, VP9 4K=313, AV1 family 394-401, H264 264/266, opus 251).
- Spoofing the `/next` body screen size to 3840x2160 (route fetch + fulfill) → **identical** onesie itag list, still played itag 399 @ 1920x960. `/next` screen spoof alone does NOT unlock higher quality.
- The server **sometimes does include a 1440p H264 format (itag 264)** in the UMP manifest for the 4K-capable video — but the player picks 1080p (399).
- In-page `window.fetch`/`XMLHttpRequest` patches catch **nothing** for the player/onesie traffic on the desktop TV-UA path (goes through Cobalt's internal media stack / not page-visible on the real TV).

### Conclusion / verdict

1. Request side is NOT the limiter (onesie already asks for up to 4K; the server already can send 1440p H264).
2. The 1080p ceiling is imposed **client-side by Cobalt's player selection**: the available-quality list caps at screen height, and it prefers AV1 (whose ladder caps at 1080p here).
3. `setPlaybackQualityRange('hd1440')` only works if the player's available list contains it — it doesn't, so it clamps.
4. Desktop web "downscales" because the desktop GPU decodes 4K and scales to the panel; on Tizen, Cobalt uses the SoC hardware decoder — a 1080p TV chip often caps at 1080p, but many Samsung SoCs decode H264 4K fine even on 1080p panels (1440p H264 likely decodable → real supersampling gain possible).

### Proposed fix (NOT implemented — user said "dont implement, still in plan phase", then asked to check current code)

Two parts, both in reachable code:

1. **Spoof screen size in the outgoing player request**: extend the patched `JSON.stringify` wrapper (`mods/features/adblock.js:280-289`) — when `value.playbackContext` exists (a player request), also set `context.client.screenWidthPoints=2560, screenHeightPoints=1440` (or 3840x2160) → server includes 1440p/4K formats in `adaptiveFormats`.
2. **Force selection past the available-list cap**: in `mods/features/preferredVideoQuality.js`, when the preferred quality isn't in `getAvailableQualityData()`, call `setPlaybackQualityRange('hd1440','hd1440')` (or `hd2160`) with the literal level instead of clamping to nearest. Since the response now contains those formats, the player can select them even though the screen is 1080p.

- Correlation: with **H264 selected**, the codec filter (`adblock.js:68-77`) keeps 137 (H264 1080p) *and* 264 (H264 1440p) — higher-bitrate files Cobalt would otherwise drop for the tiny AV1 399.

### Current code locations (for reference)

- Codec filter: `mods/features/adblock.js:68-77` — inside patched `JSON.parse`; if `videoPreferredCodec !== 'any'` and a matching format exists, keeps only `audio/` + matching video mimeTypes. This is what makes codec selection work on TV.
- JSON.stringify wrapper: `mods/features/adblock.js:279-290` — `const origStringify = JSON.stringify; JSON.stringify = function(value, replacer, space){ const pc = value?.playbackContext?.contentPlaybackContext; if (pc && !pc.isInlinePlaybackNoAd) { pc.isInlinePlaybackNoAd = true; return origStringify.call(this, value, replacer, space); } return origStringify.call(this, value, replacer, space); }; window.JSON.stringify = JSON.stringify;`
- Quality handler: `mods/features/preferredVideoQuality.js` — polls `.html5-video-player` every 100ms; on play applies via `setPlaybackQualityRange(quality, quality)` (line 95); `#determineQuality()` (line 102) uses `getAvailableQualityData?.()` qualityLabels, exact match else nearest.
- Settings entries: `mods/ui/settings.js` — `preferredVideoQuality` menu (~line 429-461, options Auto/2160p/1440p/1080p/720p/480p/360p/240p/144p). **`videoPreferredCodec` has NO settings-menu entry** — only `config.js` default + the adblock filter (settings entry may need adding if desired).
- Config defaults: `mods/config.js` line 25 `preferredVideoQuality: "auto"`, line 61 `videoPreferredCodec: "any"`.

---

## 4. Feature ideas (all REJECTED by user — do not propose again)

auto-skip recap, sleep timer, per-video resume, subtitle styling, autoplay toggle, sidebar tab reordering, queue reorder/shuffle, OLED theme, volume normalization, play-from-start long-press, watch history, branded boot overlay.

---

## 5. Useful architecture reference

- `mods/userScript.js` import order: core-js/stable → polyfills.js → whatwg-fetch → userAgentSpoofing, translations/index, domrect-polyfill, adblock, hqThumbnailsFocusObserver, sponsorblock, ui/ui, ui/speedUI, ui/theme, ui/settings, ui/disableWhosWatching, features/moreSubtitles, features/updater, features/pictureInPicture, features/preferredVideoQuality, features/videoQueuing, features/enableFeatures, ui/customUI, ui/customGuideAction, features/autoFrameRate.
- Config: localStorage key `"ytaf-configuration"`; 58 keys in `defaultConfig` (enableAdBlock, enableSponsorBlock*, sponsorBlockManualSkips, videoSpeed, preferredVideoQuality:"auto", enableDeArrowTitles, enableDeArrowThumbnails, focusContainerColor, routeColor, enableFixedUI, enableHqThumbnails:true, enableChapters, enableLongPress, enableShorts, dontCheckUpdateUntil, whosWatching*, enableShowUserLanguage, enableShowOtherLanguages, showWelcomeToast, enablePreviousNextButtons, enableSuperThanksButton, enableSpeedControlsButton, enablePatchingVideoPlayer, enableMPButton, enableSwapMPWithPIP, enablePreviews, enableHideWatchedVideos, hideWatchedVideosThreshold:80, hideWatchedVideosPages, enableHideEndScreenCards, enableYouThereRenderer, enableReducedMotion, lastAnnouncementCheck, enableScreenDimming, dimmingTimeout:60, dimmingOpacity:0.5, enablePaidPromotionOverlay, speedSettingsIncrement:0.25, videoPreferredCodec:"any", launchToOnStartup, reloadHomeOnStartup, disabledSidebarContents, disableChannelsOnSidebar, enableUpdater, autoFrameRate, autoFrameRatePauseVideoFor, enableSigninReminder, sortSubscriptionsByAlphabet).
- Rollup config `mods/rollup.config.js`: input userScript.js → `../dist/userScript.js` iife; plugins json/string(css)/nodeResolve/commonjs; babel Chrome 47 (async-to-generator, class-properties, for-of, object-rest-spread, optional-chaining, nullish-coalescing, logical-assignment, numeric-separator); terser ecma:5, mangle reserved [h5vcc,_yttv,localStorage], passes:1; `\uFFFF`→`\u0000` replace.
- `window._yttv` = app command registry; `window.tectonicConfig` = feature switches; `resolveCommand`/`dispatchCommand` used for custom actions; `showToast`, `Modal` helpers in `mods/ui/ytUI.js`.
- DIAL/launcher service in `service/service.js` (port 8085, launches `${tbPackageId}.TizenBrewStandalone`).
- `h5vcc.tizentube` API: `GetVersion()`, `SetUserAgent()` (used by userAgentSpoofing which writes a random Cobalt-style UA to localStorage then reloads).

---

## 6. Open follow-ups (NOT yet done)

- **Live YT TV pass (Playwright)**: navigate the site like a normal user and verify ad-blocking, UX and performance on the real response shapes; then add missing ad renderers confirmed live (candidates from static analysis: `promotedSparklesTextSearchRenderer` for search ads, `bannerPromoRenderer` for banner promos — do NOT add until seen live, YT TV idomkey/class names are unstable).
- **Smoke test vs axobrew**: extend `smoke-test.js` to validate the `packageType: 'mods'` contract that `../axobrew`'s `service-nextgen/service/utils/moduleLoader.js` `buildModuleData()` expects (appName, version, websiteURL→appPath, keys[], description, serviceFile, main; optional tizenAppId/evaluateScriptOnDocumentStart) and cross-check `package.json` keys against the bundle's config snapshot. Decide whether to simulate the module fetch (dev-server URL) or just the metadata contract.
- **deArrowCache eviction**: `deArrowCache` (mods/features/deArrow.js) caches one promise per videoID for the whole session — cap/evict oldest entries to bound memory on long binge sessions.
- **Dead exports**: `resetDeArrowCache` and `deArrowDeepClone` (mods/features/deArrow.js) are exported but unused — either wire them into the smoke test or drop them.
- **Dead module**: `mods/ui/chapters.js` is never imported (tree-shaken out of the bundle) and chapters were disabled in adblock.js because YT removed description data — revive when/if YT TV restores chapter data, else delete the file.
- **Config-key drift**: `mods/config.js` defaults are hand-duplicated in `service/webConfigPage.js` (DEFAULTS/GROUPS presets) and in `mods/ui/settings.js` menus — a drift risk; consider a single source of truth or a smoke assertion that the three stay in sync.
