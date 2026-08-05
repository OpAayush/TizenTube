import css from "./ui.css";
import { configRead, configChangeEmitter } from "../config.js";
import updateStyle from "./theme.js";
import { showToast } from "./ytUI.js";
import modernUI from "./settings.js";
import resolveCommand, { patchResolveCommand } from "../resolveCommand.js";
import { pipToFullscreen } from "../features/pictureInPicture.js";
import getCommandExecutor from "./customCommandExecution.js";
import { t } from "i18next";
import AXOTUBE_VERSION from "../version.js";

let initialized = false;
let keyTimeout = null;

function execute_once_dom_loaded() {
  if (initialized) return;

  // Wait for basic DOM to be ready
  if (!document.body || !window._yttv) {
    return;
  }

  initialized = true;

  const applyReducedMotion = () => {
    try {
      document.body.classList.toggle(
        "axotube-reduced-motion",
        !!configRead("enableReducedMotion"),
      );
    } catch (e) {
      console.warn("Reduced motion apply failed:", e);
    }
  };
  applyReducedMotion();

  const existingStyle = document.querySelector("style[nonce]");
  if (existingStyle) {
    existingStyle.textContent += css;
  } else {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  if (typeof window.__releaseBootLoader === "function") {
    window.__releaseBootLoader();
  }

  const ui = configRead("enableFixedUI");
  if (ui) {
    try {
      if (window.tectonicConfig) {
        window.tectonicConfig.featureSwitches.isLimitedMemory = false;
        window.tectonicConfig.clientData.legacyApplicationQuality =
          "full-animation";
        window.tectonicConfig.featureSwitches.enableAnimations = true;
        window.tectonicConfig.featureSwitches.enableOnScrollLinearAnimation = true;
        window.tectonicConfig.featureSwitches.enableListAnimations = true;
      }
    } catch (e) {
      console.warn("Could not apply UI fixes:", e);
    }
  }

  var eventHandler = (evt) => {
    if (configRead("enableScreenDimming")) {
      if (keyTimeout) {
        clearTimeout(keyTimeout);
      }
      const container = document.getElementById("container");
      if (container) {
        container.style.setProperty("opacity", "1", "important");
      }
      keyTimeout = setTimeout(
        () => {
          const videoPlayer = document.querySelector(".html5-video-player");
          if (!videoPlayer) return;
          const playerStateObject = videoPlayer.getPlayerStateObject?.();
          if (playerStateObject?.isPlaying) return;
          const container = document.getElementById("container");
          if (container) {
            container.style.setProperty(
              "opacity",
              (1 - configRead("dimmingOpacity")).toString(),
              "important",
            );
          }
        },
        configRead("dimmingTimeout") * 1000,
      );
    }

    if (evt.keyCode == 404) {
      if (evt.type === "keydown") {
        try {
          modernUI();
        } catch (e) {
          console.error("Settings open failed:", e);
        }
      }
    } else if (evt.keyCode == 39) {
      if (evt.type === "keydown") {
        if (
          document.querySelector("ytlr-search-text-box > .zylon-focus") &&
          window.isPipPlaying
        ) {
          try {
            const ytlrPlayer = document.querySelector("ytlr-player");
            if (ytlrPlayer) {
              ytlrPlayer.style.setProperty("background-color", "rgb(0, 0, 0)");
            }
            pipToFullscreen();
          } catch (e) {
            console.warn("PiP exit failed:", e);
          }
        }
      }
    }
    return true;
  };

  document.addEventListener("keydown", eventHandler, true);
  document.addEventListener("keypress", eventHandler, true);
  document.addEventListener("keyup", eventHandler, true);

  setTimeout(() => {
    if (configRead("showWelcomeToast")) {
      showToast(t("welcomeMsg.title"), `${t("welcomeMsg.subtitle")} · v${AXOTUBE_VERSION}`);
    }
  }, 1000);

  const launchData = configRead("launchToOnStartup");
  if (launchData) {
    try {
      resolveCommand(JSON.parse(launchData));
    } catch (e) {
      console.warn("Launch command failed:", e);
    }
  } else if (configRead("reloadHomeOnStartup")) {
    // Force the app back to the home route on startup (TV apps usually resume
    // where they left off otherwise).
    try {
      if (location.hash && location.hash.substring(1) !== "/") {
        location.hash = "/";
      }
    } catch (e) {
      console.warn("Reload home on startup failed:", e);
    }
  }

  const commandExecutor = getCommandExecutor();
  if (commandExecutor) {
    try {
      commandExecutor.executeFunction(
        new commandExecutor.commandFunction("reloadGuideAction"),
      );
    } catch (e) {
      console.warn("Guide reload failed:", e);
    }
  }

  if (configRead("enableFixedUI")) {
    try {
      const observer = new MutationObserver(() => {
        const body = document.body;
        if (body?.classList.contains("app-quality-root")) {
          body.classList.remove("app-quality-root");
        }
      });
      observer.observe(document.body, { attributes: true });
    } catch (e) {
      console.warn("UI quality observer failed:", e);
    }
  }

  patchResolveCommand();
}

function checkInitialization() {
  if (initialized) return;

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    if (window._yttv) {
      execute_once_dom_loaded();
      return;
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkInitialization);
}

let initAttempts = 0;
const initInterval = setInterval(() => {
  initAttempts += 1;
  checkInitialization();
  if (initialized || initAttempts >= 100) {
    clearInterval(initInterval);
  }
}, 100);

configChangeEmitter.addEventListener("configChange", updateStyle);

configChangeEmitter.addEventListener("configChange", (e) => {
  if (e.detail?.key === "enableReducedMotion") {
    try {
      document.body.classList.toggle(
        "axotube-reduced-motion",
        !!configRead("enableReducedMotion"),
      );
    } catch (err) {
      console.warn("Reduced motion update failed:", err);
    }
  }
});
