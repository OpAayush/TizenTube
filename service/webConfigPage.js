// Self-contained HTML config editor served by the Tizen service app on port 8085.
// Styling is pulled from Pico.css via CDN to keep the bundle size small —
// the page only needs a <link> tag, not a bundled stylesheet.
module.exports.webConfigPage = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>axotube Web Config</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />
<style>
  :root { --pico-font-family: "YouTube Sans", Roboto, Arial, sans-serif; }
  body > main { max-width: 980px; }
  header.app { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 18px 24px; border-bottom: 1px solid var(--pico-muted-border-color); position: sticky; top: 0; background: var(--pico-background-color); z-index: 10; }
  header.app h1 { font-size: 20px; margin: 0; }
  .badge { font-size: 13px; color: var(--pico-muted-color); }
  .status { font-size: 13px; padding: 4px 10px; border-radius: 999px; }
  .status.ok { background: var(--pico-ins-color); color: var(--pico-background-color); }
  .status.err { background: var(--pico-del-color); color: var(--pico-background-color); }
  .actions { display: flex; gap: 10px; padding: 14px 24px; flex-wrap: wrap; align-items: center; }
  .actions input[type=search] { flex: 1; min-width: 220px; margin: 0; }
  .actions button { margin: 0; }
  .hint { font-size: 12px; color: var(--pico-muted-color); padding: 0 24px; }
  main.list { padding: 8px 24px 40px; }
  .group-title { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--pico-muted-color); margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--pico-muted-border-color); }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--pico-muted-border-color); border-radius: var(--pico-border-radius); }
  .row:hover { background: var(--pico-muted-border-color); }
  .row .key { flex: 1; font-size: 13px; word-break: break-word; }
  .row .ctrl { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  input[type=color] { width: 44px; height: 32px; border: 1px solid var(--pico-muted-border-color); background: transparent; cursor: pointer; padding: 0; }
  input[type=number], select, input[type=text], input[type=url], input[type=search] { padding: 6px 8px; font-size: 13px; }
  select { min-width: 150px; }
  input[type=range] { width: 160px; }
  .presets { display: flex; gap: 4px; }
  .presets button { width: 22px; height: 22px; border-radius: 50%; padding: 0; border: 2px solid var(--pico-muted-border-color); cursor: pointer; }
  .presets button.sel { border-color: var(--pico-primary); }
  textarea { padding: 6px 8px; border-radius: var(--pico-border-radius); width: 100%; font-family: monospace; font-size: 12px; min-height: 48px; }
  .toast-save { position: fixed; right: 20px; bottom: 20px; background: var(--pico-ins-color); color: var(--pico-background-color); padding: 10px 16px; border-radius: var(--pico-border-radius); font-size: 14px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 20; }
  .toast-save.show { opacity: 1; }
  .empty { padding: 30px 24px; color: var(--pico-muted-color); font-size: 14px; }
  .bg-preview { width: 64px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid var(--pico-muted-border-color); background: var(--pico-muted-border-color); }
</style>
</head>
<body>
<header class="app">
  <h1>axotube Web Config</h1>
  <div style="display:flex;gap:10px;align-items:center;">
    <span class="badge" id="revLabel">revision -</span>
    <span class="status" id="status">connecting...</span>
  </div>
</header>
<div class="actions">
  <input type="search" id="filter" placeholder="Filter keys..." />
  <button id="btnSave">Save to TV</button>
  <button class="secondary outline" id="btnSaveReload">Save &amp; Reload TV</button>
  <button class="secondary outline" id="btnRefresh">Reload from TV</button>
  <button class="secondary outline" id="btnDefaults">Reset to defaults</button>
</div>
<p class="hint">Edits are stored on the TV service and applied live by the running app (syncs every few seconds).</p>
<main class="list" id="main"></main>
<div class="toast-save" id="toast">Saved</div>

<script>
(function () {
  var DEFAULTS = {
    enableAdBlock: true,
    enableSponsorBlock: true,
    enableSponsorBlockToasts: true,
    sponsorBlockManualSkips: ["intro", "outro", "filler"],
    enableSponsorBlockSponsor: true,
    enableSponsorBlockIntro: true,
    enableSponsorBlockOutro: true,
    enableSponsorBlockInteraction: true,
    enableSponsorBlockSelfPromo: true,
    enableSponsorBlockPreview: true,
    enableSponsorBlockMusicOfftopic: true,
    enableSponsorBlockFiller: false,
    enableSponsorBlockHighlight: true,
    videoSpeed: 1,
    preferredVideoQuality: "auto",
    enableDeArrowTitles: true,
    enableDeArrowThumbnails: true,
    routeColor: "#0f0f0f",
    routeBackgroundUrl: "",
    themePreset: "default",
    textTheme: "default",
enableHqThumbnails: true,
    enableLongPress: true,
    enableShorts: true,
    enableReducedMotion: false,
    enableWhoIsWatchingMenu: false,
    permanentlyEnableWhoIsWatchingMenu: false,
    enableWhosWatchingMenuOnAppExit: false,
    enableShowUserLanguage: true,
    enableShowOtherLanguages: false,
    showWelcomeToast: true,
    enablePreviousNextButtons: true,
    enableSuperThanksButton: false,
    enableSpeedControlsButton: true,
    enablePatchingVideoPlayer: true,
    enableMPButton: true,
    enableSwapMPWithPIP: false,
    enablePreviews: true,
    enableHideWatchedVideos: false,
    hideWatchedVideosThreshold: 80,
    hideWatchedVideosPages: [],
    enableHideEndScreenCards: false,
    enableYouThereRenderer: true,
    enableScreenDimming: false,
    dimmingTimeout: 60,
    dimmingOpacity: 0.5,
    enablePaidPromotionOverlay: true,
    speedSettingsIncrement: 0.25,
    videoPreferredCodec: "any",
    launchToOnStartup: null,
    reloadHomeOnStartup: true,
    disabledSidebarContents: [],
    disableChannelsOnSidebar: false,
    enableUpdater: true,
    autoFrameRate: false,
    autoFrameRatePauseVideoFor: 0,
    enableSigninReminder: false,
    sortSubscriptionsByAlphabet: false
  };

  var ENUMS = {
    preferredVideoQuality: ["auto", "2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"],
    videoPreferredCodec: ["any", "vp9", "av01", "avc1"],
    themePreset: ["default", "black", "darkGray", "charcoal", "navy", "darkRed", "darkGreen", "darkPurple"],
    textTheme: ["default", "white", "gray", "red", "blue", "green", "purple", "yellow"],
    speedSettingsIncrement: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]
  };
  var RANGES = {
    hideWatchedVideosThreshold: [0, 100, 1],
    dimmingTimeout: [10, 300, 10],
    dimmingOpacity: [0.1, 1, 0.1],
    autoFrameRatePauseVideoFor: [0, 120, 1],
    videoSpeed: [0.25, 2, 0.25]
  };
  var COLORS = ["routeColor"];
  var ARRAYS = ["sponsorBlockManualSkips", "hideWatchedVideosPages", "disabledSidebarContents"];
  var JSONS = ["launchToOnStartup"];
  var URLS = ["routeBackgroundUrl"];
  var COLOR_PRESETS = ["#0f0f0f", "#000000", "#1c1a1a", "#121212", "#0d1b2a", "#3b0505", "#052e1b", "#1a1025"];
  var GROUPS = {
    enableAdBlock: "AdBlock",
    enableSponsorBlock: "SponsorBlock", enableSponsorBlockToasts: "SponsorBlock",
    sponsorBlockManualSkips: "SponsorBlock", enableSponsorBlockSponsor: "SponsorBlock",
    enableSponsorBlockIntro: "SponsorBlock", enableSponsorBlockOutro: "SponsorBlock",
    enableSponsorBlockInteraction: "SponsorBlock", enableSponsorBlockSelfPromo: "SponsorBlock",
    enableSponsorBlockPreview: "SponsorBlock", enableSponsorBlockMusicOfftopic: "SponsorBlock",
    enableSponsorBlockFiller: "SponsorBlock", enableSponsorBlockHighlight: "SponsorBlock",
    enableDeArrowTitles: "Player", enableDeArrowThumbnails: "Player", videoSpeed: "Player",
    preferredVideoQuality: "Player", videoPreferredCodec: "Player",
    enablePreviousNextButtons: "Player", enableSuperThanksButton: "Player",
    enableSpeedControlsButton: "Player", enablePatchingVideoPlayer: "Player",
    enableMPButton: "Player", enableSwapMPWithPIP: "Player", enablePreviews: "Player",
    enablePip: "Player", autoFrameRate: "Player", autoFrameRatePauseVideoFor: "Player",
    routeColor: "Theme", routeBackgroundUrl: "Theme", themePreset: "Theme",
    textTheme: "Theme",
    enableHideWatchedVideos: "Interface", hideWatchedVideosThreshold: "Interface",
    hideWatchedVideosPages: "Interface", enableHideEndScreenCards: "Interface",
    enableYouThereRenderer: "Interface", enableScreenDimming: "Interface",
    dimmingTimeout: "Interface", dimmingOpacity: "Interface",
    enablePaidPromotionOverlay: "Interface",
    enableHqThumbnails: "Interface", enableLongPress: "Interface", enableShorts: "Interface",
    enableReducedMotion: "Interface",
    enableShowUserLanguage: "Interface", enableShowOtherLanguages: "Interface",
    showWelcomeToast: "Interface", enableWhoIsWatchingMenu: "Interface",
    permanentlyEnableWhoIsWatchingMenu: "Interface", enableWhosWatchingMenuOnAppExit: "Interface",
    launchToOnStartup: "Interface", reloadHomeOnStartup: "Interface",
    disabledSidebarContents: "Interface", disableChannelsOnSidebar: "Interface",
    dontCheckUpdateUntil: "System", enableUpdater: "System",
    enableSigninReminder: "System", sortSubscriptionsByAlphabet: "System"
  };
  var state = {};
  var revision = 0;

  var main = document.getElementById("main");
  var statusEl = document.getElementById("status");
  var revLabel = document.getElementById("revLabel");
  var toast = document.getElementById("toast");
  var filterEl = document.getElementById("filter");

  function setStatus(ok, msg) {
    statusEl.textContent = msg;
    statusEl.className = "status " + (ok ? "ok" : "err");
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.className = "toast-save show";
    setTimeout(function () { toast.className = "toast-save"; }, 2000);
  }

  function api(url, method, body) {
    var opts = { method: method || "GET", headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function load() {
    setStatus(false, "loading...");
    api("/api/config").then(function (data) {
      revision = data.revision || 0;
      revLabel.textContent = "revision " + revision;
      var config = (data.config && Object.keys(data.config).length) ? data.config : DEFAULTS;
      state = {};
      Object.keys(DEFAULTS).forEach(function (k) { state[k] = (k in config) ? config[k] : DEFAULTS[k]; });
      render();
      setStatus(true, "connected");
    }).catch(function () {
      setStatus(false, "service unreachable");
    });
  }

  function groupOf(k) { return GROUPS[k] || "General"; }

  function render() {
    var q = filterEl.value.toLowerCase();
    var html = "";
    var currentGroup = "";
    Object.keys(DEFAULTS).forEach(function (k) {
      if (q && k.toLowerCase().indexOf(q) === -1) return;
      var g = groupOf(k);
      if (g !== currentGroup) {
        html += '<div class="group-title">' + g + "</div>";
        currentGroup = g;
      }
      html += '<div class="row" data-key="' + k + '"><div class="key">' + k + '</div><div class="ctrl">' + controlHtml(k) + '</div></div>';
    });
    if (!html) html = '<div class="empty">No settings match "' + q + '"</div>';
    main.innerHTML = html;
    Object.keys(DEFAULTS).forEach(function (k) {
      if (q && k.toLowerCase().indexOf(q) === -1) return;
      bindControl(k);
    });
  }

  function controlHtml(k) {
    var v = state[k];
    if (COLORS.indexOf(k) !== -1) {
      var presets = "";
      COLOR_PRESETS.forEach(function (c) {
        presets += '<button type="button" class="c' + (c === v ? " sel" : "") + '" data-color="' + c + '" style="background:' + c + '"></button>';
      });
      return '<input type="color" data-color-input value="' + v + '" />' + presets;
    }
    if (URLS.indexOf(k) !== -1) {
      var preview = v ? '<img class="bg-preview" data-bg-preview src="' + v + '" alt="" />' : "";
      return '<input type="url" data-url value="' + v + '" placeholder="https://example.com/background.jpg" />' + preview;
    }
    if (ENUMS[k]) {
      var opts = "";
      ENUMS[k].forEach(function (o) {
        opts += '<option value="' + o + '"' + (String(o) === String(v) ? " selected" : "") + ">" + o + "</option>";
      });
      return '<select data-enum>' + opts + "</select>";
    }
    if (RANGES[k]) {
      return '<input type="range" data-range min="' + RANGES[k][0] + '" max="' + RANGES[k][1] + '" step="' + RANGES[k][2] + '" value="' + v + '"><span data-range-val>' + v + "</span>";
    }
    if (ARRAYS.indexOf(k) !== -1) {
      var arr = Array.isArray(v) ? v.join(",") : String(v || "");
      return '<input type="text" data-array value="' + arr + '" placeholder="comma,separated" />';
    }
    if (JSONS.indexOf(k) !== -1) {
      var jv = v === null || v === undefined ? "" : JSON.stringify(v);
      return "<textarea data-json>" + jv + "</textarea>";
    }
    if (typeof v === "boolean") {
      return '<input type="checkbox" data-bool' + (v ? " checked" : "") + " />";
    }
    if (typeof v === "number") {
      return '<input type="number" data-num value="' + v + '" step="any" />';
    }
    return '<input type="text" data-str value="' + v + '" />';
  }

  function bindControl(k) {
    var row = main.querySelector('.row[data-key="' + k + '"]');
    if (!row) return;
    if (COLORS.indexOf(k) !== -1) {
      var colorInput = row.querySelector("[data-color-input]");
      colorInput.addEventListener("change", function () {
        state[k] = colorInput.value;
        row.querySelectorAll("[data-color]").forEach(function (b) {
          b.className = "c" + (b.getAttribute("data-color") === colorInput.value ? " sel" : "");
        });
      });
      row.querySelectorAll("[data-color]").forEach(function (b) {
        b.addEventListener("click", function () {
          state[k] = b.getAttribute("data-color");
          colorInput.value = state[k];
          row.querySelectorAll("[data-color]").forEach(function (x) {
            x.className = "c" + (x === b ? " sel" : "");
          });
        });
      });
    } else if (URLS.indexOf(k) !== -1) {
      var urlInput = row.querySelector("[data-url]");
      var preview = row.querySelector("[data-bg-preview]");
      function updatePreview() {
        if (!preview) return;
        if (state[k]) {
          preview.src = state[k];
          preview.style.display = "";
        } else {
          preview.style.display = "none";
        }
      }
      urlInput.addEventListener("change", function () {
        state[k] = urlInput.value.trim();
        updatePreview();
      });
    } else if (ENUMS[k]) {
      row.querySelector("[data-enum]").addEventListener("change", function (e) {
        var raw = e.target.value;
        state[k] = typeof DEFAULTS[k] === "number" ? Number(raw) : raw;
        if (k === "themePreset") {
          var preset = {
            default: "#0f0f0f",
            black: "#000000",
            darkGray: "#121212",
            charcoal: "#121212",
            navy: "#121212",
            darkRed: "#121212",
            darkGreen: "#121212",
            darkPurple: "#121212"
          }[raw];
          if (preset) {
            state.routeColor = preset;
          }
        }
      });
    } else if (RANGES[k]) {
      row.querySelector("[data-range]").addEventListener("input", function (e) {
        state[k] = Number(e.target.value);
        row.querySelector("[data-range-val]").textContent = e.target.value;
      });
    } else if (ARRAYS.indexOf(k) !== -1) {
      row.querySelector("[data-array]").addEventListener("change", function (e) {
        state[k] = e.target.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      });
    } else if (JSONS.indexOf(k) !== -1) {
      row.querySelector("[data-json]").addEventListener("change", function (e) {
        var t = e.target.value.trim();
        try { state[k] = t ? JSON.parse(t) : null; } catch (err) { state[k] = null; }
      });
    } else if (typeof DEFAULTS[k] === "boolean") {
      row.querySelector("[data-bool]").addEventListener("change", function (e) {
        state[k] = e.target.checked;
      });
    } else if (typeof DEFAULTS[k] === "number") {
      row.querySelector("[data-num]").addEventListener("input", function (e) {
        var n = Number(e.target.value);
        state[k] = isNaN(n) ? DEFAULTS[k] : n;
      });
    } else {
      row.querySelector("[data-str]").addEventListener("change", function (e) {
        state[k] = e.target.value;
      });
    }
  }

  function collect() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = state[k]; });
    return out;
  }

  document.getElementById("btnSave").addEventListener("click", function () {
    api("/api/config", "POST", collect()).then(function (d) {
      if (d.ok) { revision = d.revision; revLabel.textContent = "revision " + revision; showToast("Saved to TV (rev " + revision + ")"); }
      else showToast("Save failed: " + (d.error || "unknown"));
    }).catch(function () { showToast("Save failed - service unreachable"); });
  });

  document.getElementById("btnSaveReload").addEventListener("click", function () {
    api("/api/config", "POST", collect()).then(function (d) {
      if (!d.ok) { showToast("Save failed: " + (d.error || "unknown")); return; }
      revision = d.revision;
      revLabel.textContent = "revision " + revision;
      api("/api/command", "POST", { action: "reload" }).then(function (r) {
        showToast(r && r.ok ? "Saved — TV reloading" : "Saved (reload failed)");
      }).catch(function () { showToast("Saved (reload failed)"); });
    }).catch(function () { showToast("Save failed - service unreachable"); });
  });

  document.getElementById("btnRefresh").addEventListener("click", load);
  document.getElementById("btnDefaults").addEventListener("click", function () {
    state = {};
    Object.keys(DEFAULTS).forEach(function (k) { state[k] = DEFAULTS[k]; });
    render();
    showToast("Defaults loaded - press Save");
  });
  filterEl.addEventListener("input", render);

  load();
})();
</script>
</body>
</html>
`;
