// Custom UI for video player
//
// Finds the "YtlrPlayerActionsContainer" class inside window._yttv and
// wraps it so we can add/remove transport-control buttons (Mini Player/PiP,
// Speed Controls, Previous/Next) at runtime.

import { extractAssignedFunctions } from "../utils/ASTParser.js";
import { configRead } from "../config.js";
import { ButtonRenderer } from "./ytUI.js";

const FEATURED_ACTION = "TRANSPORT_CONTROLS_BUTTON_TYPE_FEATURED_ACTION";

let customUIInitialized = false;

// Reference to the located container class, once found. Store { host, key }
// so we can re-apply the wrapper (the class lives nested deep inside _yttv,
// e.g. window._yttv.E.mappings.get("YtlrPlayerActionsContainer").value).
let containerRef = null;
let containerLookupDone = false;

function findPlayer() {
  return (
    document.querySelector(".html5-video-player") ||
    document.querySelector("ytlr-player")
  );
}

// Recursively walk _yttv (objects, arrays, Maps, Sets) looking for the
// player-actions-container class. Bound depth + node count so a big _yttv
// tree can never hang the page. Returns { host, key, fn } where
// host[key] === fn, so callers can write a replacement back in place.
function deepFindContainer(maxNodes) {
  const marker = "YtlrPlayerActionsContainer";
  let visited = 0;
  const seen = new WeakSet();

  function toStringIncludesCtor(fn) {
    if (visited > maxNodes) return false;
    visited++;
    try {
      const src = fn.toString();
      return src.includes(marker) && src.includes(FEATURED_ACTION);
    } catch (e) {
      return false;
    }
  }

  function walk(node, depth) {
    if (!node || depth > 8) return null;
    if (visited > maxNodes) return null;

    if (typeof node === "function") {
      if (toStringIncludesCtor(node)) {
        return { fn: node };
      }
      // Walk the function's prototype chain too (class methods).
      const proto = node.prototype;
      if (proto && typeof proto === "object") {
        const r = walk(proto, depth + 1);
        if (r) return r;
      }
      return null;
    }

    if (typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (node instanceof Map) {
      for (const [k, v] of node.entries()) {
        if (visited > maxNodes) return null;
        if (k === marker && typeof v === "function") {
          return { host: node, key: k, fn: v };
        }
        const r = walk(v, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (node instanceof Set) {
      for (const v of node.values()) {
        if (visited > maxNodes) return null;
        const r = walk(v, depth + 1);
        if (r) return r;
      }
      return null;
    }

    // Prefer the direct "YtlrPlayerActionsContainer" key for speed.
    if (node[marker] !== undefined) {
      const v = node[marker];
      if (typeof v === "function") return { host: node, key: marker, fn: v };
      const r = walk(v, depth + 1);
      if (r) return r;
    }

    const keys = Object.keys(node);
    for (const k of keys) {
      if (visited > maxNodes) return null;
      const r = walk(node[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  return walk(window._yttv, 0);
}

// Return the container class, looking it up lazily and caching the result.
function getContainerClass() {
  if (containerRef) return containerRef;
  if (containerLookupDone) return null;
  containerLookupDone = true;

  // Fast-path: some builds expose it directly at a known top-level key.
  const direct = Object.keys(window._yttv).find((key) => {
    const v = window._yttv[key];
    if (typeof v !== "function") return false;
    try {
      return v.toString().includes(FEATURED_ACTION);
    } catch (e) {
      return false;
    }
  });
  if (direct) {
    containerRef = { host: window._yttv, key: direct, fn: window._yttv[direct] };
    return containerRef;
  }

  // Deep path: walk the tree once, bounded. Prefer a node that mentions the
  // class name; fall back to any node mentioning FEATURED_ACTION.
  const strict = deepFindContainer(20000);
  if (strict) {
    containerRef = strict;
    return containerRef;
  }

  const loose = deepFindContainerLoose(20000);
  if (loose) containerRef = loose;
  return containerRef;
}

// Like deepFindContainer but matches any function mentioning FEATURED_ACTION
// (used when the class name was minified away).
function deepFindContainerLoose(maxNodes) {
  let visited = 0;
  const seen = new WeakSet();

  function matches(fn) {
    if (visited > maxNodes) return false;
    visited++;
    try {
      return fn.toString().includes(FEATURED_ACTION);
    } catch (e) {
      return false;
    }
  }

  function walk(node, depth) {
    if (!node || depth > 8) return null;
    if (visited > maxNodes) return null;

    if (typeof node === "function") {
      if (matches(node)) return { fn: node };
      const proto = node.prototype;
      if (proto && typeof proto === "object") {
        const r = walk(proto, depth + 1);
        if (r) return r;
      }
      return null;
    }

    if (typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (node instanceof Map) {
      for (const [k, v] of node.entries()) {
        if (visited > maxNodes) return null;
        if (k === "YtlrPlayerActionsContainer" && typeof v === "function") {
          return { host: node, key: k, fn: v };
        }
        const r = walk(v, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (node instanceof Set) {
      for (const v of node.values()) {
        if (visited > maxNodes) return null;
        const r = walk(v, depth + 1);
        if (r) return r;
      }
      return null;
    }

    const keys = Object.keys(node);
    for (const k of keys) {
      if (visited > maxNodes) return null;
      if (k === "YtlrPlayerActionsContainer") {
        const v = node[k];
        if (typeof v === "function") return { host: node, key: k, fn: v };
      }
      const r = walk(node[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  return walk(window._yttv, 0);
}

function applyPatches() {
  if (customUIInitialized) return;
  if (!window._yttv) return;
  if (!findPlayer()) return;

  const ref = getContainerClass();
  if (!ref) return;

  try {
    const origMethod = ref.fn;

    function YtlrPlayerActionsContainer() {
      const args = Array.prototype.slice.call(arguments);
      const isClass = /^class\s/.test(origMethod.toString());

      function constructAsNew(ctor, argsList) {
        if (
          typeof Reflect !== "undefined" &&
          typeof Reflect.construct === "function"
        ) {
          return Reflect.construct(ctor, argsList, YtlrPlayerActionsContainer);
        }
        return new origMethod(...argsList);
      }

      if (!(this instanceof YtlrPlayerActionsContainer)) {
        if (isClass) return constructAsNew(origMethod, args);
        return origMethod.apply(this, args);
      }

      let inst;
      if (isClass) {
        inst = constructAsNew(origMethod, args);
      } else {
        origMethod.apply(this, args);
        inst = this;
      }

      try {
        const functions = extractAssignedFunctions(origMethod.toString());

        const pipCommand = {
          type: "TRANSPORT_CONTROLS_BUTTON_TYPE_PIP",
          button: {
            buttonRenderer: ButtonRenderer(
              false,
              configRead("enableSwapMPWithPIP")
                ? "Picture in Picture"
                : "Mini Player",
              "CLEAR_COOKIES",
              {
                customAction: {
                  action: configRead("enableSwapMPWithPIP")
                    ? "ENTER_PIP"
                    : "ENTER_MP",
                },
              },
            ),
          },
        };

        const settingActionGroup = functions
          .find((func) => {
            return func.rhs.includes(
              "TRANSPORT_CONTROLS_BUTTON_TYPE_PLAYBACK_SETTINGS",
            );
          })
          ?.left?.split(".")[1];

        if (settingActionGroup && configRead("enableMPButton")) {
          const origSettingActionGroup = inst[settingActionGroup];
          if (typeof origSettingActionGroup === "function") {
            inst[settingActionGroup] = function () {
              const res = origSettingActionGroup.apply(this, arguments);
              if (Array.isArray(res)) {
                if (
                  !res.find(
                    (item) =>
                      item.type === "TRANSPORT_CONTROLS_BUTTON_TYPE_PIP",
                  )
                ) {
                  const settingsIdx = res.findIndex(
                    (item) =>
                      item.type ===
                      "TRANSPORT_CONTROLS_BUTTON_TYPE_PLAYBACK_SETTINGS",
                  );
                  if (settingsIdx !== -1) {
                    res.splice(settingsIdx, 0, pipCommand);
                  }
                }
              }
              return res;
            };
          }
        }

        const previousButtonName = functions
          .find((func) => {
            if (func.rhs.includes("skipNextButton")) {
              const skipNextButtonIndex = func.rhs.indexOf("skipNextButton");
              const skipPreviousButtonIndex =
                func.rhs.indexOf("skipPreviousButton");
              if (skipPreviousButtonIndex > skipNextButtonIndex) {
                return true;
              }
            }
          })
          ?.left?.split(".")[1];

        const nextButtonName = functions
          .find((func) => {
            if (func.rhs.includes("skipPreviousButton")) {
              const skipNextButtonIndex = func.rhs.indexOf("skipNextButton");
              const skipPreviousButtonIndex =
                func.rhs.indexOf("skipPreviousButton");
              if (skipNextButtonIndex > skipPreviousButtonIndex) {
                return true;
              }
            }
          })
          ?.left?.split(".")[1];

        const engagementActionButton = functions
          .find((func) => func.rhs.includes("props.data.engagementActions"))
          ?.left?.split(".")[1];

        if (engagementActionButton && configRead("enableSpeedControlsButton")) {
          const origEngagementActionButton = inst[engagementActionButton];
          if (typeof origEngagementActionButton === "function") {
            inst[engagementActionButton] = function () {
              const res = origEngagementActionButton.apply(this, arguments);
              if (
                Array.isArray(res) &&
                !res.find(
                  (item) => item.type === "TRANSPORT_CONTROLS_BUTTON_TYPE_SPEED",
                )
              ) {
                res.push({
                  type: "TRANSPORT_CONTROLS_BUTTON_TYPE_SPEED",
                  button: {
                    buttonRenderer: ButtonRenderer(
                      false,
                      "Speed Controls",
                      "SLOW_MOTION_VIDEO",
                      {
                        customAction: {
                          action: "TT_SPEED_SETTINGS_SHOW",
                        },
                      },
                    ),
                  },
                });
              }
              return res;
            };
          }
        }

        if (!configRead("enableSuperThanksButton") && engagementActionButton) {
          const origEngagementActionButton = inst[engagementActionButton];
          if (typeof origEngagementActionButton === "function") {
            inst[engagementActionButton] = function () {
              const res = origEngagementActionButton.apply(this, arguments);
              if (Array.isArray(res)) {
                return res.filter(
                  (item) =>
                    item.type !==
                      "TRANSPORT_CONTROLS_BUTTON_TYPE_SUPER_THANKS" &&
                    item.type !== "TRANSPORT_CONTROLS_BUTTON_TYPE_SHOPPING",
                );
              }
              return res;
            };
          }
        }

        if (
          configRead("enablePreviousNextButtons") &&
          previousButtonName &&
          nextButtonName
        ) {
          inst[previousButtonName] = function () {
            return ButtonRenderer(false, "Previous", "SKIP_PREVIOUS", {
              signalAction: {
                signal: "PLAYER_PLAY_PREVIOUS",
              },
            });
          };

          inst[nextButtonName] = function () {
            return ButtonRenderer(false, "Next", "SKIP_NEXT", {
              signalAction: {
                signal: "PLAYER_PLAY_NEXT",
              },
            });
          };
        }
      } catch (e) {
        console.warn("Custom UI patching failed:", e);
      }

      return inst;
    }

    if (configRead("enablePatchingVideoPlayer")) {
      YtlrPlayerActionsContainer.prototype = origMethod.prototype;
      // Write the wrapper back in place so the app actually uses it.
      if (ref.host && ref.key) {
        ref.host[ref.key] = YtlrPlayerActionsContainer;
      } else {
        // Fallback: keep the ref pointing at the wrapper.
        ref.fn = YtlrPlayerActionsContainer;
      }
    }

    customUIInitialized = true;
  } catch (e) {
    console.error("Custom UI apply failed:", e);
  }
}

function checkAndApplyPatches() {
  if (!customUIInitialized) {
    applyPatches();
  }
}

let attempts = 0;
const MAX_ATTEMPTS = 10;

if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  checkAndApplyPatches();
} else {
  window.addEventListener("DOMContentLoaded", checkAndApplyPatches);
}

const customUICheckInterval = setInterval(() => {
  attempts++;
  checkAndApplyPatches();
  // Never loop forever: if the container class could not be located after
  // the bounded number of attempts (e.g. the constant moved again), give up
  // so we don't burn CPU scanning window._yttv forever.
  if (customUIInitialized || attempts >= MAX_ATTEMPTS) {
    clearInterval(customUICheckInterval);
  }
}, 500);
