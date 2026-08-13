// Smoke test for the built bundle: drives the patched JSON.parse/stringify
// wrappers with fixture data and asserts the performance-related behaviors.
const path = require('path');
const BUNDLE = path.join(__dirname, 'dist', 'userScript.js');
const fs = require('fs');
const src = fs.readFileSync(BUNDLE, 'utf8');

const out = (m) => process.stdout.write(m + '\n');
console.log = console.info = console.warn = console.error = () => {};

function fail(msg) { out('FAIL: ' + msg); process.exit(1); }
function pass(msg) { out('PASS: ' + msg); }

// ---- browser global stubs ----
const noop = () => {};
const listeners = {};

function fakeEl(tag) {
  return {
    tagName: tag || 'DIV',
    style: {},
    classList: { add: noop, remove: noop, contains: () => false },
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    focus: noop, blur: noop,
    isConnected: true,
    value: '', checked: false, type: '',
    textContent: '', src: '', srcset: '',
  };
}

const CONFIG_KEY = 'ytaf-configuration';
function setConfig(cfg) {
  const json = JSON.stringify(cfg);
  localStorageStub._data = json;
  localStorageStub[CONFIG_KEY] = json;
}
const localStorageStub = {
  _data: '',
  getItem(k) { return this._data; },
  setItem(k, v) { this._data = String(v); this[CONFIG_KEY] = String(v); },
  removeItem(k) { this._data = ''; this[CONFIG_KEY] = undefined; },
  clear() { this._data = ''; this[CONFIG_KEY] = undefined; },
};
setConfig({ enableHqThumbnails: true, enableDeArrowTitles: true, enableDeArrowThumbnails: true, enableLongPress: true, enableShorts: false, enableHideWatchedVideos: true, hideWatchedVideosPages: ['home'], hideWatchedVideosThreshold: 80, enableAdBlock: true, enablePaidPromotionOverlay: false, textTheme: 'default' });

global.localStorage = localStorageStub;
global.self = globalThis; // bundle expects a browser-like global `self`
global.window = {
  localStorage: localStorageStub,
  _yttv: {},
  navigate: noop,
  h5vcc: undefined,
  queuedVideos: { videos: [], lastVideoId: null },
  sponsorblock: null,
  JSON: JSON, // will be replaced by the bundle itself (window.JSON.parse = ...)
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
};
global.document = {
  readyState: 'complete',
  head: { appendChild: noop },
  body: fakeEl('BODY'),
  createElement: (t) => fakeEl(t),
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createEvent: () => ({ initEvent: noop }),
  dispatchEvent: noop,
};
global.location = { hash: '#/' };
global.Image = function () {
  this.naturalWidth = 1280;
  this.naturalHeight = 720;
  this.onload = null;
  this.onerror = null;
  let _src;
  Object.defineProperty(this, 'src', {
    get: () => _src,
    set: (v) => { _src = v; queueMicrotask(() => this.onload && this.onload()); },
  });
};
global.MutationObserver = function (cb) { this.cb = cb; this.observe = noop; this.disconnect = noop; };
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.cancelAnimationFrame = clearTimeout;
global.navigator = { language: 'en', userAgent: 'node' };

let fetchCount = 0;
global.fetch = (url) => {
  fetchCount++;
  const m = /videoID=([^&]+)/.exec(String(url));
  const videoID = m && m[1];
  return Promise.resolve({
    json: () => Promise.resolve({
      titles: videoID === 'abc123' ? [{ title: 'DEARROWED TITLE', votes: 10 }] : [],
      thumbnails: videoID === 'darrow1' ? [{ timestamp: 123, votes: 9 }] : [],
    }),
  });
};

// ---- run the bundle ----
const nativeParse = JSON.parse;
const nativeStringify = JSON.stringify;
try {
  require(BUNDLE);
} catch (e) {
  fail('bundle threw at load: ' + e.message);
}

const patchedParse = window.JSON.parse;
const patchedStringify = window.JSON.stringify;

if (patchedParse === nativeParse) fail('window.JSON.parse was not patched');
if (patchedStringify === nativeStringify) fail('window.JSON.stringify was not patched');
pass('JSON.parse / JSON.stringify patched on window');

// ---- fixture: browse response with one shelf, 3 tiles ----
function makeTile(id, title, opts = {}) {
  const tile = {
    tileRenderer: {
      contentType: 'TILE_CONTENT_TYPE_VIDEO',
      style: opts.style || 'TILE_STYLE_YTLR_DEFAULT',
      contentId: id,
      metadata: { tileMetadataRenderer: {
        title: { simpleText: title },
        lines: [{ lineRenderer: { items: [{ lineItemRenderer: { text: { runs: [{ text: 'Subtitle ' + id }] } } }] } }],
      } },
      header: {
        tileHeaderRenderer: {
          thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, width: 320, height: 180 }] },
        },
      },
      onSelectCommand: { watchEndpoint: { videoId: id } },
    },
  };
  if (opts.watched) {
    tile.tileRenderer.header.tileHeaderRenderer.thumbnailOverlays = [
      { thumbnailOverlayResumePlaybackRenderer: { percentDurationWatched: 95 } },
    ];
  }
  if (opts.onFocus) {
    tile.tileRenderer.onFocusCommand = { playbackEndpoint: { watchEndpoint: { videoId: id } } };
  }
  if (opts.short) {
    tile.tileRenderer.tvhtml5ShelfRendererType = 'TVHTML5_TILE_RENDERER_TYPE_SHORTS';
  }
  return tile;
}

function browseResponse() {
  return {
    contents: {
      sectionListRenderer: {
        contents: [
          { shelfRenderer: { tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_GRID',
            content: { horizontalListRenderer: { items: [
              makeTile('abc123', 'Video A'),
              makeTile('def456', 'Video B'),
              makeTile('ghi789', 'Video C'),
            ] } } } },
        ],
      },
    },
  };
}

// ---- 1. hqify + addLongPress + deArrowify + hideVideo + shorts ----
const r1 = browseResponse();
r1.contents.sectionListRenderer.contents.push({
  shelfRenderer: { tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS',
    content: { horizontalListRenderer: { items: [makeTile('shorts1', 'Short', { short: true })] } } },
});

const parsed1 = patchedParse(JSON.stringify(r1));

// shorts shelf removed
const shelfCount = parsed1.contents.sectionListRenderer.contents.length;
if (shelfCount !== 1) fail('shorts shelf not removed, got ' + shelfCount);
pass('shorts shelf removed');

// hqify applied
const t1 = parsed1.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items[0];
if (!t1.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.includes('maxresdefault.jpg')) {
  fail('hqify did not set maxresdefault');
}
pass('hqify applied (maxresdefault first entry)');

// addLongPress attached compact payload, no circular refs (stringify must not throw)
let menuPayload = null;
try {
  const serialized = patchedStringify(parsed1);
  menuPayload = JSON.parse(serialized);
} catch (e) {
  fail('response contains circular refs: ' + e.message);
}
const longPress = menuPayload.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items[0].tileRenderer.onLongPressCommand;
if (!longPress || !longPress.showMenuCommand) fail('long-press menu missing');
const queueItem = longPress.showMenuCommand.menu.menuRenderer.items.find(i => i.menuServiceItemRenderer && i.menuServiceItemRenderer.text.runs[0].text === 'Add to Queue');
if (!queueItem) fail('Add to Queue item missing');
const qp = queueItem.menuServiceItemRenderer.serviceEndpoint.playlistEditEndpoint.customAction.parameters;
if (qp.tileRenderer.contentId !== 'abc123' || !qp.tileRenderer.onSelectCommand) fail('compact payload missing required fields');
if (qp.tileRenderer.onFocusCommand !== undefined || qp.tileRenderer.onLongPressCommand !== undefined) {
  fail('compact payload not compact (carries extra data)');
}
pass('compact queue payload (no onFocusCommand/onLongPressCommand inside)');

// ---- 2. deArrow cache: second parse of same video must not re-fetch ----
const before = fetchCount;
patchedParse(JSON.stringify(browseResponse()));
const afterFirst = fetchCount;
patchedParse(JSON.stringify(browseResponse()));
if (fetchCount !== afterFirst) fail('deArrow re-fetched cached video (fetchCount ' + fetchCount + ')');
if (before !== 3) fail('expected exactly one fetch per distinct video, got ' + before);
pass('deArrow cache works (fetchCount stays ' + fetchCount + ')');

// ---- 3. hideVideo on watched tile (config set at bundle load above) ----
const r3 = browseResponse();
r3.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items.push(makeTile('watched1', 'Watched', { watched: true }));
const parsed3 = patchedParse(JSON.stringify(r3));
const ids = parsed3.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items.map(i => i.tileRenderer.contentId);
if (ids.includes('watched1')) fail('watched video not hidden: ' + ids.join(','));
if (!ids.includes('abc123')) fail('unwatched video wrongly hidden: ' + ids.join(','));
pass('hideVideo removed watched tile (95% > threshold 80)');

// ---- 4. JSON.stringify wrapper: single-pass, mutates input ----
const playerResp = { playbackContext: { contentPlaybackContext: { isInlinePlaybackNoAd: false } }, foo: 1 };
const sOut = patchedStringify(playerResp);
if (!sOut.includes('"isInlinePlaybackNoAd":true')) fail('stringify did not set isInlinePlaybackNoAd');
if (playerResp.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd !== true) fail('input was not mutated in place');
const sOut2 = patchedStringify(playerResp);
if (sOut2 !== sOut) fail('stringify not idempotent');
pass('stringify wrapper single-pass + idempotent');

// ---- 5. hqify memo: identity skip on double-processed shelf ----
const r5 = browseResponse();
patchedParse(JSON.stringify(r5));
const r5b = { contents: { sectionListRenderer: { contents: r5.contents.sectionListRenderer.contents } } };
const parsed5 = patchedParse(JSON.stringify(r5b));
const t5 = parsed5.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items[0];
if (!t5.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.includes('maxresdefault')) {
  fail('re-processed shelf lost HQ thumbnails');
}
pass('re-processed shelf keeps HQ thumbnails (memo)');

// ---- 6. hqify non-default tile style (regression: TILE_STYLE gate removed) ----
const r6 = browseResponse();
r6.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items.push(
  makeTile('wide1', 'Wide Tile', { style: 'TILE_STYLE_YTLR_WIDE' }),
);
const parsed6 = patchedParse(JSON.stringify(r6));
const wideTile = parsed6.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items.find(
  (i) => i.tileRenderer.contentId === 'wide1',
);
if (!wideTile || !wideTile.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.includes('maxresdefault.jpg')) {
  fail('hqify skipped a non-TILE_STYLE_YTLR_DEFAULT tile');
}
pass('hqify applies to non-default tile styles');

// ---- 7. adblock JSON patch (ad containers emptied) ----
const adResp = {
  adPlacements: [{ entityKey: 'x' }],
  playerAds: [{ ad: {} }],
  adSlots: [{ id: 1 }],
  paidContentOverlay: { some: 'thing' },
};
const adOut = patchedParse(JSON.stringify(adResp));
if (!Array.isArray(adOut.adPlacements) || adOut.adPlacements.length) fail('adPlacements not emptied');
if (!Array.isArray(adOut.playerAds) || adOut.playerAds.length) {
  if (adOut.playerAds !== false) fail('playerAds not emptied (got ' + JSON.stringify(adOut.playerAds) + ')');
}
if (!Array.isArray(adOut.adSlots) || adOut.adSlots.length) fail('adSlots not emptied');
if (adOut.paidContentOverlay !== null) fail('paidContentOverlay not nulled');
pass('adblock empties adPlacements/playerAds/adSlots + nulls paidContentOverlay');

// ---- 8. cross-repo: axotube package.json vs axobrew 'mods' module contract ----
(async () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

  // Mirror of axobrew moduleLoader.buildModuleData() for packageType 'mods'
  const buildModuleData = (module, moduleJson) => {
    if (!moduleJson || moduleJson.packageType !== 'mods') return null;
    const slash = module.indexOf('/');
    return {
      fullName: module,
      appName: moduleJson.appName,
      version: moduleJson.version,
      name: module.substring(slash + 1),
      appPath: moduleJson.websiteURL,
      keys: moduleJson.keys ? moduleJson.keys : [],
      moduleType: module.substring(0, slash),
      packageType: moduleJson.packageType,
      description: moduleJson.description,
      serviceFile: moduleJson.serviceFile,
      tizenAppId: moduleJson.tizenAppId,
      mainFile: moduleJson.main,
      evaluateScriptOnDocumentStart: moduleJson.evaluateScriptOnDocumentStart,
      dev: false,
    };
  };

  const modData = buildModuleData('npm/axotube', pkgJson);
  if (!modData) fail('package.json is not packageType "mods"');
  for (const k of ['appName', 'version', 'name', 'appPath', 'moduleType', 'packageType', 'description', 'serviceFile', 'mainFile']) {
    if (typeof modData[k] !== 'string' || !modData[k]) fail('module contract field missing/empty: ' + k);
  }
  if (!Array.isArray(modData.keys) || modData.keys.some((k) => typeof k !== 'string')) fail('keys must be an array of strings');
  if (!modData.appPath.startsWith('http')) fail('appPath (websiteURL) must start with http');
  for (const f of [modData.mainFile, modData.serviceFile]) {
    if (!fs.existsSync(path.join(__dirname, f))) fail('bundled file missing on disk: ' + f);
  }
  pass('package.json satisfies mods contract (' + modData.moduleType + '/' + modData.name + ' v' + modData.version + ')');

  // ---- 9. deArrow titles applied once fetch resolves (async) ----
  await new Promise((r) => setTimeout(r, 0));
  const rt = browseResponse();
  const pt = patchedParse(JSON.stringify(rt));
  const tTitle = pt.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items[0]
    .tileRenderer.metadata.tileMetadataRenderer.title.simpleText;
  if (tTitle !== 'DEARROWED TITLE') fail('deArrow title not applied, got: ' + tTitle);
  pass('deArrow title applied from cache after async fetch');

  // ---- 9b. deArrow community thumbnail wins over hqify when both enabled ----
  const rd = browseResponse();
  rd.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items.unshift(
    makeTile('darrow1', 'Community Thumb'),
  );
  const pd = patchedParse(JSON.stringify(rd));
  await new Promise((r) => setTimeout(r, 0));
  const dTile = pd.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items.find(
    (i) => i.tileRenderer.contentId === 'darrow1',
  );
  const dUrl = dTile.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url;
  if (!dUrl.includes('dearrow-thumb')) fail('deArrow thumbnail did not win over hqify: ' + dUrl);
  pass('deArrow community thumbnail overrides hqify (ordering)');

  // ---- 9. brand + version hygiene in bundle ----
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  if (bundle.includes('__AXOTUBE_VERSION__')) fail('raw __AXOTUBE_VERSION__ marker still in bundle');
  if (!bundle.includes(pkgJson.version)) fail('bundle does not embed package.json version ' + pkgJson.version);
  if (/premium.?logo/i.test(bundle)) fail('premium logo strings leaked into bundle');
  if (!bundle.includes('axotube-reduced-motion')) fail('reduced-motion CSS class missing from bundle');
  if (!bundle.includes('enableDeArrowTitles') || !bundle.includes('enableDeArrowThumbnails')) fail('deArrow config keys missing from bundle');
  pass('bundle hygiene: version embedded, no premium-logo, reduced-motion + deArrow keys present');

  // ---- 10. drift guard vs real ../axobrew loader (skip if sibling absent) ----
  const loaderPath = path.join(__dirname, '..', 'axobrew', 'axobrew-app', 'axobrew', 'service-nextgen', 'service', 'utils', 'moduleLoader.js');
  if (fs.existsSync(loaderPath)) {
    const loader = fs.readFileSync(loaderPath, 'utf8');
    const required = ["packageType === 'mods'", 'mainFile: moduleJson.main', 'appPath: moduleJson.websiteURL', 'serviceFile: moduleJson.serviceFile'];
    const missing = required.filter((f) => !loader.includes(f));
    if (missing.length) fail('axobrew loader drifted from smoke-test contract: ' + missing.join(' | '));
    pass('real ../axobrew moduleLoader in sync with simulated mods contract');
  } else {
    out('SKIP: ../axobrew moduleLoader.js not found (contract cross-check skipped)');
  }

  out('\nALL TESTS PASSED');
  process.exit(0);
})();
