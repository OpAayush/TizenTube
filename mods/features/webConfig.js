// Web config sync. The Tizen service app (TizenBrewStandalone) hosts a config
// editor on port 8085, reachable from the TV's IP. It runs in a separate app
// context, so it can't read the YouTube app's localStorage. This module:
//   1. Pushes this app's config to the service (GET-able by the web page).
//   2. Polls for edits made on the web page and applies them live via
//      configWrite (fires configChange -> theme.js/updateStyle etc.).
//   3. Polls for phone->TV commands (play/search/browse) and dispatches them
//      through resolveCommand, and pushes current playback back for the phone.
// Only active on real Tizen (window.h5vcc.tizentube). Quiet no-op otherwise.
import {
  configRead,
  configWrite,
  configSnapshot,
  nativeJSONStringify,
  configChangeEmitter,
} from "../config.js";
import resolveCommand from "../resolveCommand.js";
import { showToast, canDispatch } from "../ui/ytUI.js";
import { fetchWithTimeout } from "../shared/fetch.js";

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
  // instead of latching a toast that was silently dropped. canDispatch() walks
  // window._yttv, whose getters can throw on half-initialized objects — keep
  // it inside the guard so a throw can never kill the poll's apply loop.
  try {
    if (!isTizen() || !canDispatch()) return;
    showToast("axotube", "Service connected");
    serviceToastShown = true;
  } catch (err) {
    // Toast is best-effort; never let it break the sync loop.
  }
}

// Push the device config only when it actually differs from what we last sent.
// This keeps the 5s poll free of per-tick POST traffic (the old code pushed the
// whole snapshot unconditionally on every pull). The push carries the last
// service revision the device has APPLIED (appliedRevision): the service
// rejects a push from a device that is behind (e.g. a boot-time push that
// predates an unsynced web-page edit), so a stale snapshot can never clobber a
// fresh web-page save.
function pushIfChanged() {
  if (!isTizen() || syncing) return;
  let serialized;
  try {
    serialized = nativeJSONStringify({
      revision: appliedRevision,
      config: configSnapshot(),
    });
  } catch (err) {
    return;
  }
  if (typeof serialized !== "string") return;
  if (serialized === lastPushed) return;
  lastPushed = serialized;
  syncing = true;
  fetchWithTimeout(`${WEB_CONFIG_URL}/api/config/push`, {
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
  fetchWithTimeout(`${WEB_CONFIG_URL}/api/config`)
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
        // null is a legitimate value (e.g. launchToOnStartup cleared on the
        // web page) and must reach the device; only undefined means absent.
        if (typeof value === "undefined") return;
        try {
          if (configRead(key) !== value) {
            configWrite(key, value);
          }
        } catch (err) {
          // One bad key must not abort the rest of the apply loop.
        }
      });
      // Applying remote edits fires configChange -> schedulePush, which
      // reflects the device snapshot (with any extra local-only keys) back to
      // the service once this poll's syncing flag is released.
    })
    .catch(() => {})
    .then(() => {
      syncing = false;
      // Reflect the device snapshot back to the service after every pull.
      // A fresh service (empty store) gets seeded at boot this way, and a
      // post-apply snapshot with extra local-only keys reaches the web page.
      // Deduped by lastPushed, so it only posts when the snapshot differs;
      // it carries the revision we just applied, so the service's gate accepts
      // it — and rejects it if a web-page edit landed in between.
      pushIfChanged();
    });
}

// Phone->TV commands: fetch any pending play/search/browse pushed via the
// service's /api/command endpoint and dispatch it like a cast would. Called on
// the same poll interval as the config sync so a phone command lands within
// ~5s of being sent.
function consumeCommand() {
  if (!isTizen() || syncing) return;
  fetchWithTimeout(`${WEB_CONFIG_URL}/api/command`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || !data.command) return;
      if (data.command.action === "reload") {
        try {
          window.location.reload();
        } catch (err) {
          // Best-effort; the app would pick the reload up on the next poll.
        }
        return;
      }
      const cmd = buildCommand(data.command);
      if (!cmd) return;
      dispatchWhenReady(cmd);
      showToast("axotube", "Command received");
    })
    .catch(() => {});
}

// Map a phone command to a resolveCommand payload (mirrors castReceiver).
function buildCommand(command) {
  if (!command || typeof command !== "object") return null;
  if (command.action === "play") {
    const watch = { videoId: command.videoId };
    if (command.playlistId) watch.playlistId = command.playlistId;
    return { watchEndpoint: watch };
  }
  if (command.action === "search" && command.query) {
    return { searchEndpoint: { query: command.query } };
  }
  if (command.action === "browse" && command.browseId) {
    return { browseEndpoint: { browseId: command.browseId } };
  }
  return null;
}

function dispatchWhenReady(cmd) {
  if (!cmd) return;
  const dispatch = () => {
    try {
      resolveCommand(cmd);
    } catch (err) {
      // Best-effort; never break the rest of the script.
    }
  };

  if (
    typeof window !== "undefined" &&
    window._yttv &&
    Object.keys(window._yttv).length > 0
  ) {
    dispatch();
    return;
  }

  let attempts = 0;
  const interval = setInterval(() => {
    attempts += 1;
    const ready =
      typeof window !== "undefined" &&
      window._yttv &&
      Object.keys(window._yttv).length > 0;
    if (ready || attempts > 50) {
      clearInterval(interval);
      if (ready) dispatch();
    }
  }, 200);
}

// Push current playback info to the service so a phone can show now-playing.
// Reuses the pushIfChanged style guard to avoid spamming on every poll.
let lastNowPlaying = "";

function pushNowPlaying() {
  if (!isTizen() || syncing) return;
  let info = null;
  try {
    const video = document.querySelector("video");
    if (video && video.currentSrc) {
      const match = location.hash.match(/[?&]v=([^&]+)/);
      const videoId = match ? match[1] : null;
      info = {
        videoId,
        title:
          document.querySelector("ytlr-player-header-title")?.textContent ||
          document.title,
        state: video.paused ? "paused" : "playing",
        progress: video.currentTime,
        duration: video.duration,
      };
    }
  } catch (err) {
    return;
  }
  const serialized = info ? nativeJSONStringify(info) : "none";
  if (serialized === lastNowPlaying) return;
  lastNowPlaying = serialized;
  fetchWithTimeout(`${WEB_CONFIG_URL}/api/nowplaying`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serialized === "none" ? "null" : serialized,
  }).catch(() => {});
}

// Small delay so the app (and its config) is up before the first sync, then
// keep the service's copy fresh, apply web-page edits, consume phone commands,
// and report now-playing.
setTimeout(() => {
  pullAndApply();
  consumeCommand();
  setInterval(() => {
    pullAndApply();
    consumeCommand();
    pushNowPlaying();
  }, POLL_INTERVAL_MS);
}, 3000);
