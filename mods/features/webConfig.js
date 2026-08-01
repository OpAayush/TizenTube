// Web config sync. The Tizen service app (TizenBrewStandalone) hosts a config
// editor on port 8085, reachable from the TV's IP. It runs in a separate app
// context, so it can't read the YouTube app's localStorage. This module:
//   1. Pushes this app's config to the service (GET-able by the web page).
//   2. Polls for edits made on the web page and applies them live via
//      configWrite (fires configChange -> theme.js/updateStyle etc.).
// Only active on real Tizen (window.h5vcc.tizentube). Quiet no-op otherwise.
import { configRead, configWrite, configSnapshot, nativeJSONStringify } from "../config.js";
import { showToast } from "../ui/ytUI.js";

const WEB_CONFIG_URL = "http://127.0.0.1:8085";
const POLL_INTERVAL_MS = 5000;

let appliedRevision = -1;
let syncing = false;
let serviceToastShown = false;

function isTizen() {
  return typeof window !== "undefined" && window.h5vcc && window.h5vcc.tizentube;
}

function showServiceToast() {
  if (serviceToastShown) return;
  serviceToastShown = true;
  try {
    showToast("AixoTube", "Service connected");
  } catch (err) {
    // Toast is best-effort; never let it break the sync loop.
  }
}

function pushConfig() {
  if (!isTizen()) return Promise.resolve();
  try {
    return fetch(`${WEB_CONFIG_URL}/api/config/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: nativeJSONStringify(configSnapshot()),
    }).catch(() => {});
  } catch (err) {
    return Promise.resolve();
  }
}

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
    })
    .catch(() => {})
    .then(() => {
      pushConfig().then(() => {
        syncing = false;
      });
    });
}

// Small delay so the app (and its config) is up before the first sync, then
// keep the service's copy fresh and apply any web-page edits.
setTimeout(() => {
  pullAndApply();
  setInterval(pullAndApply, POLL_INTERVAL_MS);
}, 3000);
