// Web config sync. The Tizen service app (TizenBrewStandalone) hosts a config
// editor on port 8085, reachable from the TV's IP. It runs in a separate app
// context, so it can't read the YouTube app's localStorage. This module:
//   1. Pushes this app's config to the service (GET-able by the web page).
//   2. Polls for edits made on the web page and applies them live via
//      configWrite (fires configChange -> theme.js/updateStyle etc.).
// Only active on real Tizen (window.h5vcc.tizentube). Quiet no-op otherwise.
import {
  configRead,
  configWrite,
  configSnapshot,
  nativeJSONStringify,
  configChangeEmitter,
} from "../config.js";
import { showToast, canDispatch } from "../ui/ytUI.js";

const WEB_CONFIG_URL = "http://127.0.0.1:8085";
const POLL_INTERVAL_MS = 5000;

let appliedRevision = -1;
let syncing = false;
let lastPushed = ""; // serialized snapshot last sent to the service
let pushTimer = null;
let serviceToastShown = false;

function isTizen() {
  return typeof window !== "undefined" && window.h5vcc && window.h5vcc.tizentube;
}

function showServiceToast() {
  if (serviceToastShown) return;
  // The toast needs YouTube's resolveCommand to be up. If it isn't yet (the
  // service can beat YouTube to ready), bail out and let the next poll retry
  // instead of latching a toast that was silently dropped.
  if (!isTizen() || !canDispatch()) return;
  try {
    showToast("axotube", "Service connected");
    serviceToastShown = true;
  } catch (err) {
    // Toast is best-effort; never let it break the sync loop.
  }
}

// Push the device config only when it actually differs from what we last sent.
// This keeps the 5s poll free of per-tick POST traffic (the old code pushed the
// whole snapshot unconditionally on every pull).
function pushIfChanged() {
  if (!isTizen() || syncing) return;
  let serialized;
  try {
    serialized = nativeJSONStringify(configSnapshot());
  } catch (err) {
    return;
  }
  if (typeof serialized !== "string") return;
  if (serialized === lastPushed) return;
  lastPushed = serialized;
  syncing = true;
  fetch(`${WEB_CONFIG_URL}/api/config/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serialized,
  })
    .catch(() => {
      lastPushed = ""; // reset so a later poll retries the push
    })
    .then(() => {
      syncing = false;
    });
}

// Debounced push for local config edits that happen between polls (e.g. the
// user toggles a setting on the TV; the web page should get it immediately).
function schedulePush() {
  if (!isTizen() || syncing) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushIfChanged, 250);
}
configChangeEmitter.addEventListener("configChange", schedulePush);

function pullAndApply() {
  if (!isTizen() || syncing) return;
  syncing = true;
  fetch(`${WEB_CONFIG_URL}/api/config`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || typeof data.revision !== "number") return;
      showServiceToast();
      if (data.revision === appliedRevision) return;
      appliedRevision = data.revision;
      const remote = data.config;
      if (!remote || typeof remote !== "object") return;
      Object.keys(remote).forEach((key) => {
        const value = remote[key];
        if (typeof value === "undefined" || value === null) return;
        if (configRead(key) !== value) {
          configWrite(key, value);
        }
      });
      // Applying remote edits updates the local snapshot; make sure the device
      // (with any extra local-only keys) is reflected back to the service.
      pushIfChanged();
    })
    .catch(() => {})
    .then(() => {
      syncing = false;
    });
}

// Small delay so the app (and its config) is up before the first sync, then
// keep the service's copy fresh and apply any web-page edits.
setTimeout(() => {
  pullAndApply();
  setInterval(pullAndApply, POLL_INTERVAL_MS);
}, 3000);
