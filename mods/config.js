const CONFIG_KEY = "ytaf-configuration";

// Capture native JSON before the adblock.js patch replaces JSON.parse/stringify.
// configRead/configWrite run inside the patched wrappers (every response parse),
// so calling the wrapper from here would recurse infinitely on the populate path.
const nativeJSONParse = JSON.parse;
const nativeJSONStringify = JSON.stringify;
const clone = (value) => nativeJSONParse(nativeJSONStringify(value));

const defaultConfig = {
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
  enableFixedUI: window.h5vcc && window.h5vcc.tizentube ? false : true,
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
  sortSubscriptionsByAlphabet: false,
};

let localConfig;

function initConfig() {
  try {
    if (window.localStorage && window.localStorage[CONFIG_KEY]) {
      localConfig = nativeJSONParse(window.localStorage[CONFIG_KEY]);
      return;
    }
  } catch (err) {
    console.warn("Config read failed:", err);
  }
  localConfig = clone(defaultConfig);
}

initConfig();

function tryPersistConfig() {
  try {
    if (!window.localStorage) return false;
    const serialized = nativeJSONStringify(localConfig);
    window.localStorage[CONFIG_KEY] = serialized;
    return true;
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      console.warn("localStorage quota exceeded, clearing old data");
      try {
        window.localStorage.clear();
        window.localStorage[CONFIG_KEY] = nativeJSONStringify(localConfig);
        return true;
      } catch (e2) {
        console.error("Failed to persist config even after clearing:", e2);
        return false;
      }
    }
    console.error("Failed to persist config:", err);
    return false;
  }
}

export function configRead(key) {
  if (localConfig[key] === undefined) {
    if (defaultConfig[key] === undefined) {
      console.warn("Unknown config key", key);
      return undefined;
    }
    console.warn(
      "Populating key",
      key,
      "with default value",
      defaultConfig[key],
    );
    localConfig[key] = clone(defaultConfig[key]);
  }
  return localConfig[key];
}

export function configWrite(key, value) {
  console.info("Setting key", key, "to", value);
  localConfig[key] = value;
  tryPersistConfig();
  configChangeEmitter.dispatchEvent(
    new CustomEvent("configChange", { detail: { key, value } }),
  );
}

export const configChangeEmitter = new EventTarget();

// Deep snapshot of the entire config, used by the web-config sync module to
// push the app's current state to the service (config.js:127 configWrite).
export function configSnapshot() {
  return clone(localConfig);
}

// Exposed for modules that deep-copy JSON inside the patched wrappers
// (adblock.js addPreviews/makeQueuePayload). Calling window.JSON.parse
// there re-enters the patched wrapper on every tile — use these natives.
export { nativeJSONParse, nativeJSONStringify };
