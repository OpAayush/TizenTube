// Picture in Picture Mode for AixoTube

// At function call, get it from window
const resolveCommand =
  window._yttv_resolveCommand ||
  (window._yttv
    ? Object.values(window._yttv).find((a) => a && a.instance?.resolveCommand)
        ?.instance?.resolveCommand
    : null);
window.isPipPlaying = false;
let PlayerService = null;
let observerPipEnter = null;

function pipLoad() {
  try {
    const mappings = window._yttv
      ? Object.values(window._yttv).find((a) => a && a.mappings)
      : null;
    if (!mappings) return;

    PlayerService = mappings.get("PlayerService");
    const PlaybackPreviewService = mappings.get("PlaybackPreviewService");

    if (!PlaybackPreviewService) return;

    const PlaybackPreviewServiceStart = PlaybackPreviewService.start;
    const PlaybackPreviewServiceStop = PlaybackPreviewService.stop;

    PlaybackPreviewService.start = function (...args) {
      if (window.isPipPlaying) return;
      return PlaybackPreviewServiceStart.apply(this, args);
    };

    PlaybackPreviewService.stop = function (...args) {
      if (window.isPipPlaying) return;
      return PlaybackPreviewServiceStop.apply(this, args);
    };
  } catch (e) {
    console.warn("PiP service loading failed:", e);
  }
}

if (document.readyState === "complete") {
  pipLoad();
} else {
  window.addEventListener("load", pipLoad);
}

function enablePip() {
  if (!PlayerService) return;

  try {
    const videoElement = document.querySelector("video");
    if (!videoElement) return;

    const timestamp = Math.floor(videoElement.currentTime);

    const ytlrPlayer = document.querySelector("ytlr-player");
    const ytlrPlayerContainer = document.querySelector("ytlr-player-container");

    if (!ytlrPlayer || !ytlrPlayerContainer) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          if (!ytlrPlayer.classList.contains("ytLrPlayerEnabled")) {
            function setStyles() {
              ytlrPlayerContainer.style.zIndex = "10";
              ytlrPlayer.style.display = "block";
              ytlrPlayer.style.backgroundColor = "rgba(0,0,0,0)";
            }

            setStyles();
            setTimeout(setStyles, 500);

            function onPipEnter() {
              const video = document.querySelector("video");
              if (!video) return;

              video.style.removeProperty("inset");
              const pipWidth = window.innerWidth / 3.5;
              const pipHeight = window.innerHeight / 3.5;
              video.style.width = `${pipWidth}px`;
              video.style.height = `${pipHeight}px`;
              video.style.top = "68vh";
              video.style.left = "68vw";

              window.isPipPlaying = true;
              video.removeEventListener("play", onPipEnter);
            }

            videoElement.addEventListener("play", onPipEnter);
            observer.disconnect();

            setTimeout(() => {
              try {
                if (PlayerService && PlayerService.loadedPlaybackConfig) {
                  PlayerService.loadedPlaybackConfig.watchEndpoint.startTimeSeconds =
                    timestamp;
                  PlayerService.loadVideo(PlayerService.loadedPlaybackConfig);
                }
              } catch (e) {
                console.warn("PiP video load failed:", e);
              }
            }, 1000);
          }
        }
      });
    });

    observer.observe(ytlrPlayer, { attributes: true });

    resolveCommand({
      signalAction: {
        signal: "HISTORY_BACK",
      },
    });
  } catch (e) {
    console.error("Enable PiP failed:", e);
  }
}

function pipToFullscreen() {
  try {
    if (!PlayerService || !PlayerService.loadedPlaybackConfig) return;

    const videoElement = document.querySelector("video");
    const { clickTrackingParams, commandMetadata, watchEndpoint } =
      PlayerService.loadedPlaybackConfig;

    if (videoElement && watchEndpoint) {
      watchEndpoint.startTimeSeconds = Math.floor(videoElement.currentTime);
    }

    const command = {
      clickTrackingParams,
      commandMetadata,
      watchEndpoint,
    };

    resolveCommand(command);
    window.isPipPlaying = false;
  } catch (e) {
    console.error("PiP to fullscreen failed:", e);
  }
}

const originalClasses = {
  ytlrSearchVoice: {
    length: 0,
    classes: [],
  },
  ytlrSearchVoiceMicButton: {
    length: 0,
    classes: [],
  },
};

function initPipObserver() {
  if (observerPipEnter) return;

  observerPipEnter = new MutationObserver(() => {
    if (!window.isPipPlaying) return;

    try {
      const searchBar = document.querySelector("ytlr-search-bar");
      if (!searchBar) return;

      const pipButtonExists = document.querySelector("#tt-pip-button");
      if (pipButtonExists) return;

      const voiceButton = searchBar.querySelector("ytlr-search-voice");
      if (!voiceButton) return;

      const iconClassNames = window._yttv
        ? Object.values(window._yttv).find(
            (a) => a instanceof Map && a.has("CLEAR_COOKIES"),
          )
        : null;
      if (!iconClassNames) return;

      const iconClassToBeRemoved = iconClassNames.get("MICROPHONE_ON");
      const iconClearCookiesClass = iconClassNames.get("CLEAR_COOKIES");
      const pipButton = document.createElement("ytlr-search-voice");

      for (let i = 0; i < voiceButton.classList.length; i++) {
        if (originalClasses.ytlrSearchVoice.length === 0) {
          originalClasses.ytlrSearchVoice.length = voiceButton.classList.length;
        }

        if (
          originalClasses.ytlrSearchVoice.length !==
          voiceButton.classList.length
        ) {
          for (const className of originalClasses.ytlrSearchVoice.classes) {
            pipButton.classList.add(className);
          }
          break;
        }

        if (
          !originalClasses.ytlrSearchVoice.classes.includes(
            voiceButton.classList[i],
          )
        )
          originalClasses.ytlrSearchVoice.classes.push(
            voiceButton.classList[i],
          );

        pipButton.classList.add(voiceButton.classList[i]);
      }

      pipButton.style.left = "10.25em";
      pipButton.id = "tt-pip-button";
      const pipButtonMicButton = document.createElement(
        "ytlr-search-voice-mic-button",
      );

      for (let i = 0; i < voiceButton.children[0].classList.length; i++) {
        if (originalClasses.ytlrSearchVoiceMicButton.length === 0) {
          originalClasses.ytlrSearchVoiceMicButton.length =
            voiceButton.children[0].classList.length;
        }

        if (
          originalClasses.ytlrSearchVoiceMicButton.length !==
          voiceButton.children[0].classList.length
        ) {
          for (const className of originalClasses.ytlrSearchVoiceMicButton
            .classes) {
            pipButtonMicButton.classList.add(className);
          }
          break;
        }

        if (
          !originalClasses.ytlrSearchVoiceMicButton.classes.includes(
            voiceButton.children[0].classList[i],
          )
        )
          originalClasses.ytlrSearchVoiceMicButton.classes.push(
            voiceButton.children[0].classList[i],
          );

        pipButtonMicButton.classList.add(voiceButton.children[0].classList[i]);
      }

      const pipIcon = document.createElement("yt-icon");
      for (
        let i = 0;
        i < voiceButton.children[0].children[0].classList.length;
        i++
      ) {
        pipIcon.classList.add(voiceButton.children[0].children[0].classList[i]);
      }
      pipIcon.classList.remove(iconClassToBeRemoved);
      pipIcon.classList.add(iconClearCookiesClass);

      pipButtonMicButton.appendChild(pipIcon);
      pipButton.appendChild(pipButtonMicButton);
      searchBar.appendChild(pipButton);
    } catch (e) {
      console.warn("PiP button creation failed:", e);
    }
  });

  observerPipEnter.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPipObserver);
} else {
  initPipObserver();
}

export { enablePip, pipToFullscreen };
