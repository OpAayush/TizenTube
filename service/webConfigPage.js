// Self-contained HTML config editor served by the Tizen service app on port 8085.
// No external CDNs — must work offline on any browser pointed at the TV's IP.
module.exports.webConfigPage = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AixoTube Web Config</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "YouTube Sans", Roboto, Arial, sans-serif; background: #181818; color: #eee; }
  header { padding: 18px 24px; background: #212121; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 20px; margin: 0; flex: 1; }
  .badge { font-size: 13px; color: #aaa; }
  .status { font-size: 13px; padding: 4px 10px; border-radius: 12px; }
  .status.ok { background: #1b5e20; color: #c8e6c9; }
  .status.err { background: #7f1010; color: #ffcdd2; }
  .actions { display: flex; gap: 8px; padding: 14px 24px; flex-wrap: wrap; }
  .actions input[type=text] { background: #212121; border: 1px solid #444; color: #eee; padding: 8px 12px; border-radius: 4px; min-width: 260px; }
  button { background: #cc0000; color: #fff; border: 0; padding: 9px 18px; border-radius: 4px; cursor: pointer; font-size: 14px; }
  button.ghost { background: #333; }
  button:hover { filter: brightness(1.15); }
  main { padding: 8px 24px 40px; max-width: 860px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #2a2a2a; }
  .row:nth-child(even) { background: #1e1e1e; }
  .row .key { flex: 1; font-size: 13px; color: #ddd; word-break: break-word; }
  .row .ctrl { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
  input[type=color] { width: 44px; height: 30px; border: 1px solid #555; background: transparent; cursor: pointer; padding: 0; }
  input[type=number], select, input[type=text] { background: #212121; border: 1px solid #444; color: #eee; padding: 6px 8px; border-radius: 4px; font-size: 13px; }
  select { min-width: 150px; }
  input[type=range] { width: 160px; }
  .presets { display: flex; gap: 4px; }
  .presets button { width: 22px; height: 22px; border-radius: 50%; padding: 0; border: 2px solid #555; }
  .presets button.sel { border-color: #fff; }
  textarea { background: #212121; border: 1px solid #444; color: #eee; padding: 6px 8px; border-radius: 4px; width: 100%; font-family: monospace; font-size: 12px; min-height: 48px; }
  .hint { font-size: 12px; color: #888; padding: 0 24px; }
  .toast-save { position: fixed; right: 20px; bottom: 20px; background: #1b5e20; color: #c8e6c9; padding: 10px 16px; border-radius: 4px; font-size: 14px; opacity: 0; transition: opacity .25s; }
  .toast-save.show { opacity: 1; }
  .empty { padding: 30px 24px; color: #999; font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>AixoTube Web Config</h1>
  <span class="badge" id="revLabel">revision -</span>
  <span class="status" id="status">connecting...</span>
</header>
<div class="actions">
  <input type="text" id="filter" placeholder="Filter keys..." />
  <button id="btnSave">Save to TV</button>
  <button class="ghost" id="btnRefresh">Reload from TV</button>
  <button class="ghost" id="btnDefaults">Reset to defaults</button>
</div>
<p class="hint">Edits are stored on the TV service and applied live by the running app (syncs every few seconds).</p>
<main id="main"></main>
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
    enableDeArrow: true,
    enableDeArrowThumbnails: false,
    focusContainerColor: "#0f0f0f",
    routeColor: "#0f0f0f",
    themePreset: "default",
    enableHqThumbnails: true,
    enableLongPress: true,
    enableShorts: true,
    enablePremiumLogo: false,
    dontCheckUpdateUntil: 0,
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
    themePreset: ["default", "black", "darkGray", "charcoal", "navy", "darkRed", "darkGreen", "darkPurple"],    speedSettingsIncrement: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]
  };
  var RANGES = {
    hideWatchedVideosThreshold: [0, 100, 1],
    dimmingTimeout: [10, 300, 10],
    dimmingOpacity: [0.1, 1, 0.1],
    autoFrameRatePauseVideoFor: [0, 120, 1],
    videoSpeed: [0.25, 2, 0.25]
  };
  var COLORS = ["focusContainerColor", "routeColor"];
  var ARRAYS = ["sponsorBlockManualSkips", "hideWatchedVideosPages", "disabledSidebarContents"];
  var JSONS = ["launchToOnStartup"];
  var COLOR_PRESETS = ["#0f0f0f", "#000000", "#1c1a1a", "#121212", "#0d1b2a", "#3b0505", "#052e1b", "#1a1025"];
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

  function render() {
    var q = filterEl.value.toLowerCase();
    var html = "";
    Object.keys(DEFAULTS).forEach(function (k) {
      if (q && k.toLowerCase().indexOf(q) === -1) return;
      html += '<div class="row" data-key="' + k + '"><div class="key">' + k + '</div><div class="ctrl">' + controlHtml(k) + '</div></div>';
    });
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
    } else if (ENUMS[k]) {
      row.querySelector("[data-enum]").addEventListener("change", function (e) {
        var raw = e.target.value;
        state[k] = typeof DEFAULTS[k] === "number" ? Number(raw) : raw;
        if (k === "themePreset") {
          var preset = {
            default: ["#0f0f0f", "#0f0f0f"],
            black: ["#000000", "#000000"],
            darkGray: ["#1c1a1a", "#121212"],
            charcoal: ["#121212", "#121212"],
            navy: ["#0d1b2a", "#121212"],
            darkRed: ["#3b0505", "#121212"],
            darkGreen: ["#052e1b", "#121212"],
            darkPurple: ["#1a1025", "#121212"]
          }[raw];
          if (preset) {
            state.focusContainerColor = preset[0];
            state.routeColor = preset[1];
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
