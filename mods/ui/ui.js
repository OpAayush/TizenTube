import css from "./ui.css";
import { configRead, configChangeEmitter } from "../config.js";
import updateStyle from "./theme.js";
import { showToast } from "./ytUI.js";
import modernUI from "./settings.js";
import resolveCommand, { patchResolveCommand } from "../resolveCommand.js";
import { pipToFullscreen } from "../features/pictureInPicture.js";
import getCommandExecutor from "./customCommandExecution.js";
import { t } from "i18next";

let initialized = false;
let keyTimeout = null;

function execute_once_dom_loaded() {
  if (initialized) return;

  // Wait for basic DOM to be ready
  if (!document.body || !window._yttv) {
    return;
  }

  initialized = true;

  const existingStyle = document.querySelector("style[nonce]");
  if (existingStyle) {
    existingStyle.textContent += css;
  } else {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
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

  var ARROW_KEY_CODE = { 37: "left", 38: "up", 39: "right", 40: "down" };

  var uiContainer = document.createElement("div");
  uiContainer.classList.add("ytaf-ui-container");
  uiContainer.style["display"] = "none";
  uiContainer.setAttribute("tabindex", 0);

  uiContainer.addEventListener(
    "keydown",
    (evt) => {
      if (evt.keyCode !== 404 && evt.keyCode !== 172) {
        if (evt.keyCode in ARROW_KEY_CODE) {
          try {
            window.navigate?.(ARROW_KEY_CODE[evt.keyCode]);
          } catch (e) {
            console.warn("Navigation failed:", e);
          }
        } else if (evt.keyCode === 13 || evt.keyCode === 32) {
          const focusedElement = document.querySelector(":focus");
          if (focusedElement?.type === "checkbox") {
            focusedElement.checked = !focusedElement.checked;
            focusedElement.dispatchEvent(new Event("change"));
          }
          evt.preventDefault();
          evt.stopPropagation();
          return;
        } else if (
          evt.keyCode === 27 &&
          document.querySelector(":focus")?.type !== "text"
        ) {
          uiContainer.style.display = "none";
          uiContainer.blur();
        } else if (
          document.querySelector(":focus")?.type === "text" &&
          evt.keyCode === 27
        ) {
          const focusedElement = document.querySelector(":focus");
          focusedElement.value = focusedElement.value.slice(0, -1);
        }
      }
    },
    true,
  );

  try {
    // Create elements instead of using innerHTML to avoid TrustedHTML issues
    const h1 = document.createElement("h1");
    h1.textContent = "AixoTube Theme Configuration";

    const label1 = document.createElement("label");
    label1.setAttribute("for", "__barColor");
    label1.textContent = "Navigation Bar Color: ";
    const input1 = document.createElement("input");
    input1.type = "text";
    input1.id = "__barColor";
    label1.appendChild(input1);

    const label2 = document.createElement("label");
    label2.setAttribute("for", "__routeColor");
    label2.textContent = "Main Content Color: ";
    const input2 = document.createElement("input");
    input2.type = "text";
    input2.id = "__routeColor";
    label2.appendChild(input2);

    const div = document.createElement("div");
    const small = document.createElement("small");
    small.textContent = "Sponsor segments skipping powered by SponsorBlock";
    div.appendChild(small);

    uiContainer.appendChild(h1);
    uiContainer.appendChild(label1);
    uiContainer.appendChild(label2);
    uiContainer.appendChild(div);

    document.querySelector("body").appendChild(uiContainer);

    uiContainer.querySelector("#__barColor").value = configRead(
      "focusContainerColor",
    );
    uiContainer
      .querySelector("#__barColor")
      .addEventListener("change", (evt) => {
        try {
          configRead("focusContainerColor");
        } catch (e) {
          console.error("Color save failed:", e);
        }
      });

    uiContainer.querySelector("#__routeColor").value = configRead("routeColor");
    uiContainer
      .querySelector("#__routeColor")
      .addEventListener("change", (evt) => {
        try {
          configRead("routeColor");
        } catch (e) {
          console.error("Color save failed:", e);
        }
      });
  } catch (e) {
    // Silently fail if UI container setup fails
    // This can happen if YouTube TV hasn't fully initialized
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

    if (evt.keyCode == 403) {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.type === "keydown") {
        try {
          if (uiContainer.style.display === "none") {
            uiContainer.style.display = "block";
            uiContainer.focus();
          } else {
            uiContainer.style.display = "none";
            uiContainer.blur();
          }
        } catch (e) {
          console.warn("UI container toggle failed:", e);
        }
      }
      return false;
    } else if (evt.keyCode == 404) {
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
      showToast(t("welcomeMsg.title"), t("welcomeMsg.subtitle"));
    }
  }, 1000);

  const launchData = configRead("launchToOnStartup");
  if (launchData) {
    try {
      resolveCommand(JSON.parse(launchData));
    } catch (e) {
      console.warn("Launch command failed:", e);
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
    const videoElement = document.querySelector("video");
    if (videoElement) {
      execute_once_dom_loaded();
      return;
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkInitialization);
}

const initInterval = setInterval(() => {
  checkInitialization();
  if (initialized) {
    clearInterval(initInterval);
  }
}, 100);

configChangeEmitter.addEventListener("configChange", updateStyle);
