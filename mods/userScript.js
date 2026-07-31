/**
 * userScript.js – AixoTube entry point.
 *
 * Import order matters for Tizen 4 (N5470 / Cobalt) compatibility:
 *  1. core-js/stable  – polyfills for ES built-ins not natively available
 *                       in Chromium 47 (Array.flat, Object.fromEntries, …)
 *  2. polyfills.js    – browser-API polyfills NOT covered by core-js
 *                       (EventTarget ctor, AbortController, CustomEvent, …)
 *  3. whatwg-fetch    – fetch() polyfill
 *  4. app modules     – everything else
 */

// ── 1. core-js: polyfills needed for Chrome 47 ───────────────────────────────
import 'core-js/stable';

// ── 2. Browser-API polyfills (EventTarget ctor, AbortController, …) ───────────
import './polyfills.js';

// ── 3. Fetch polyfill ─────────────────────────────────────────────────────────
import 'whatwg-fetch';

// ── 5. Application modules ────────────────────────────────────────────────────
import './features/userAgentSpoofing.js';
import './translations/index.js';
import './domrect-polyfill';

import './features/adblock.js';
import './features/hqThumbnailsFocusObserver.js';
import './features/sponsorblock.js';
import './ui/ui.js';
import './ui/speedUI.js';
import './ui/theme.js';
import './ui/settings.js';
import './ui/disableWhosWatching.js';
import './features/moreSubtitles.js';
import './features/updater.js';
import './features/pictureInPicture.js';
import './features/preferredVideoQuality.js';
import './features/videoQueuing.js';
import './features/enableFeatures.js';
import './ui/customUI.js';
import './ui/customGuideAction.js';
import './features/autoFrameRate.js';
import './features/premiumLogo.js';