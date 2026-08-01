import sha256 from "../tiny-sha256.js";
import { configRead } from "../config.js";
import { showToast } from "../ui/ytUI.js";
import { t } from "i18next";

const FETCH_TIMEOUT = 5000;
const SEGMENT_SKIP_COOLDOWN = 500;

const barTypes = {
  sponsor: {
    color: "#00d400",
    opacity: "0.7",
    name: t("sponsorblock.segments.sponsor") || "sponsored segment",
  },
  intro: {
    color: "#00ffff",
    opacity: "0.7",
    name: t("sponsorblock.segments.intro") || "intro",
  },
  outro: {
    color: "#0202ed",
    opacity: "0.7",
    name: t("sponsorblock.segments.outro") || "outro",
  },
  interaction: {
    color: "#cc00ff",
    opacity: "0.7",
    name: t("sponsorblock.segments.interaction") || "interaction reminder",
  },
  selfpromo: {
    color: "#ffff00",
    opacity: "0.7",
    name: t("sponsorblock.segments.selfpromo") || "self-promotion",
  },
  preview: {
    color: "#008fd6",
    opacity: "0.7",
    name: t("sponsorblock.segments.preview") || "recap or preview",
  },
  filler: {
    color: "#7300FF",
    opacity: "0.9",
    name: t("sponsorblock.segments.filler") || "tangents",
  },
  music_offtopic: {
    color: "#ff9900",
    opacity: "0.7",
    name: t("sponsorblock.segments.music_offtopic") || "non-music part",
  },
  poi_highlight: {
    color: "#9b044c",
    opacity: "0.7",
    name: t("sponsorblock.segments.poi_highlight") || "highlight",
  },
};

const sponsorblockAPI = "https://sponsor.ajay.app/api";

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;
  sliderInterval = null;
  lastSkippedSegmentUUID = null;
  lastSkipTime = 0;

  observer = null;
  scheduleSkipHandler = null;
  durationChangeHandler = null;
  segments = null;
  skippableCategories = [];
  manualSkippableCategories = [];
  skippedCategories = new Map();

  constructor(videoID) {
    this.videoID = videoID;
  }

  async init() {
    const videoHash = sha256(this.videoID).substring(0, 4);
    const categories = [
      "sponsor",
      "intro",
      "outro",
      "interaction",
      "selfpromo",
      "preview",
      "filler",
      "music_offtopic",
      "poi_highlight",
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const resp = await fetch(
        `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
          JSON.stringify(categories),
        )}`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);

      const results = await resp.json();
      const result = results.find((v) => v.videoID === this.videoID);
      console.info(this.videoID, "Got it:", result);

      if (!result || !result.segments || !result.segments.length) {
        console.info(this.videoID, "No segments found.");
        return;
      }

      this.segments = result.segments.filter((seg) => {
        if (!seg.segment || seg.segment.length < 2) return false;
        const [start, end] = seg.segment;
        return (
          typeof start === "number" &&
          typeof end === "number" &&
          start < end &&
          start >= 0
        );
      });

      this.manualSkippableCategories = configRead("sponsorBlockManualSkips");
      this.skippableCategories = this.getSkippableCategories();

      this.scheduleSkipHandler = () => {
        const slider = document.querySelector('div[idomkey="slider"]');
        const sliderRect = slider?.getBoundingClientRect();
        const isOldUI = !document.querySelector(
          'div[idomkey="Metadata-Section"]',
        );
        if (isOldUI && sliderRect) {
          this.segmentsoverlay.style.setProperty(
            "top",
            `${sliderRect.top}px`,
            "important",
          );
        }
        this.scheduleSkip();
      };
      this.durationChangeHandler = () => this.buildOverlay();

      this.attachVideo();
      this.buildOverlay();
    } catch (err) {
      console.error("SponsorBlock init error:", err);
    }
  }

  getSkippableCategories() {
    const skippableCategories = [];
    if (configRead("enableSponsorBlockSponsor")) {
      skippableCategories.push("sponsor");
    }
    if (configRead("enableSponsorBlockIntro")) {
      skippableCategories.push("intro");
    }
    if (configRead("enableSponsorBlockOutro")) {
      skippableCategories.push("outro");
    }
    if (configRead("enableSponsorBlockInteraction")) {
      skippableCategories.push("interaction");
    }
    if (configRead("enableSponsorBlockSelfPromo")) {
      skippableCategories.push("selfpromo");
    }
    if (configRead("enableSponsorBlockPreview")) {
      skippableCategories.push("preview");
    }
    if (configRead("enableSponsorBlockFiller")) {
      skippableCategories.push("filler");
    }
    if (configRead("enableSponsorBlockMusicOfftopic")) {
      skippableCategories.push("music_offtopic");
    }
    return skippableCategories;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector("video");
    if (!this.video) {
      console.info(this.videoID, "No video yet...");
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    console.info(this.videoID, "Video found, binding...");

    this.video.addEventListener("play", this.scheduleSkipHandler);
    this.video.addEventListener("pause", this.scheduleSkipHandler);
    this.video.addEventListener("timeupdate", this.scheduleSkipHandler);
    this.video.addEventListener("durationchange", this.durationChangeHandler);
  }

  buildOverlay() {
    if (this.segmentsoverlay) {
      console.info("Overlay already built");
      return;
    }

    if (!this.video || !this.video.duration) {
      console.info("No video duration yet");
      return;
    }

    const videoDuration = this.video.duration;
    const slider = document.querySelector('div[idomkey="slider"]');
    if (!slider) return;

    this.segmentsoverlay = document.createElement("div");

    this.segmentsoverlay.classList.add(
      "ytLrProgressBarSlider",
      "ytLrProgressBarSliderRectangularProgressBar",
    );
    this.segmentsoverlay.style.setProperty("z-index", "10", "important");
    this.segmentsoverlay.style.setProperty(
      "background-color",
      "rgba(0, 0, 0, 0)",
      "important",
    );
    this.segmentsoverlay.style.setProperty("width", "72rem", "important");
    this.segmentsoverlay.style.setProperty("left", "4rem", "important");
    const sliderRect = slider.getBoundingClientRect();
    if (!slider.classList.contains("ytLrProgressBarSlider")) {
      for (let i = 0; i < slider.classList.length; i++) {
        this.segmentsoverlay.classList.add(slider.classList[i]);
      }
      this.segmentsoverlay.style.setProperty(
        "height",
        `${sliderRect.height}px`,
        "important",
      );
      this.segmentsoverlay.style.setProperty(
        "bottom",
        `${sliderRect.bottom - sliderRect.top}px`,
        "important",
      );
    }

    if (this.segments) {
      this.segments.forEach((segment) => {
        const [start, end] = segment.segment;
        const barType = barTypes[segment.category] || {
          color: "blue",
          opacity: 0.7,
        };

        const leftPercent = videoDuration ? (100.0 * start) / videoDuration : 0;
        const widthPercent = videoDuration
          ? (100.0 * (end - start)) / videoDuration
          : 0;

        const elm = document.createElement("div");
        elm.style.setProperty("background-color", barType.color, "important");
        elm.style.setProperty("opacity", barType.opacity, "important");
        elm.style.setProperty("height", "100%", "important");
        elm.style.setProperty(
          "width",
          `${segment.category === "poi_highlight" ? 1 : widthPercent}%`,
          "important",
        );
        elm.style.setProperty("left", `${leftPercent}%`, "important");
        elm.style.setProperty("position", "absolute", "important");
        this.segmentsoverlay.appendChild(elm);
      });
    }

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.removedNodes) {
          for (const node of m.removedNodes) {
            if (node === this.segmentsoverlay) {
              console.info("bringing back segments overlay");
              if (this.slider) {
                this.slider.appendChild(this.segmentsoverlay);
              }
            }
          }
        }

        const progressBar = document.querySelector("ytlr-progress-bar");
        if (progressBar && this.segmentsoverlay) {
          if (progressBar.getAttribute("hybridnavfocusable") === "false") {
            this.segmentsoverlay.style.setProperty(
              "display",
              "none",
              "important",
            );
          } else {
            this.segmentsoverlay.style.setProperty(
              "display",
              "block",
              "important",
            );
          }
        }
      });
    });

    this.sliderInterval = setInterval(() => {
      this.slider = document.querySelector(
        "ytlr-redux-connect-ytlr-progress-bar",
      );
      if (this.slider) {
        clearInterval(this.sliderInterval);
        this.sliderInterval = null;
        this.observer.observe(this.slider, {
          childList: true,
          subtree: true,
        });
        this.slider.appendChild(this.segmentsoverlay);
      }
    }, 500);
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active || !this.video || !this.segments) {
      return;
    }

    if (this.video.paused) {
      return;
    }

    const currentTime = this.video.currentTime;
    const nextSegments = this.segments.filter(
      (seg) =>
        seg.segment[0] > currentTime - 0.3 &&
        seg.segment[1] > currentTime - 0.3,
    );
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);

    if (!nextSegments.length) {
      return;
    }

    const [segment] = nextSegments;
    const [start, end] = segment.segment;
    const delayMs = Math.max(0, (start - currentTime) * 1000);

    console.info(
      this.videoID,
      "Scheduling skip of",
      segment,
      "in",
      start - currentTime,
    );

    this.nextSkipTimeout = setTimeout(() => {
      this.performSkip(segment, end);
    }, delayMs);
  }

  performSkip(segment, end) {
    if (!this.active || !this.video) return;
    if (this.video.paused) return;

    const now = Date.now();
    if (
      segment.UUID === this.lastSkippedSegmentUUID &&
      now - this.lastSkipTime < SEGMENT_SKIP_COOLDOWN
    ) {
      console.info(this.videoID, "Skipping duplicate segment skip");
      return;
    }

    if (!this.skippableCategories.includes(segment.category)) {
      console.info(
        this.videoID,
        "Segment",
        segment.category,
        "is not skippable, ignoring...",
      );
      return;
    }

    const skipName = barTypes[segment.category]?.name || segment.category;
    console.info(this.videoID, "Skipping", segment);

    if (!this.manualSkippableCategories.includes(segment.category)) {
      const wasSkippedBefore = this.skippedCategories.get(segment.UUID);
      if (wasSkippedBefore) {
        wasSkippedBefore.count++;
        wasSkippedBefore.lastSkipped = Date.now();
        this.skippedCategories.set(segment.UUID, wasSkippedBefore);

        if (
          wasSkippedBefore.lastSkipped - wasSkippedBefore.firstSkipped <
          1000
        ) {
          if (!wasSkippedBefore.hasShownToast) {
            if (configRead("enableSponsorBlockToasts")) {
              showToast(
                "SponsorBlock",
                t("sponsorblock.toasts.notSkipping", {
                  segment: skipName,
                  count: wasSkippedBefore.count,
                }),
              );
            }
            wasSkippedBefore.hasShownToast = true;
            this.skippedCategories.set(segment.UUID, wasSkippedBefore);
          }
          return;
        }
      } else {
        this.skippedCategories.set(segment.UUID, {
          count: 1,
          firstSkipped: Date.now(),
          lastSkipped: Date.now(),
          hasShownToast: false,
        });
      }
      if (configRead("enableSponsorBlockToasts")) {
        showToast(
          "SponsorBlock",
          t("sponsorblock.toasts.skipping", { segment: skipName }),
        );
      }

      const skipTarget =
        this.video.duration - end < 1 ? Math.max(end - 1, 0) : end;
      this.video.currentTime = skipTarget;
      this.lastSkippedSegmentUUID = segment.UUID;
      this.lastSkipTime = Date.now();
      this.scheduleSkip();
    }
  }

  destroy() {
    console.info(this.videoID, "Destroying");

    this.active = false;

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (this.attachVideoTimeout) {
      clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }

    if (this.sliderInterval) {
      clearInterval(this.sliderInterval);
      this.sliderInterval = null;
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.segmentsoverlay) {
      this.segmentsoverlay.remove();
      this.segmentsoverlay = null;
    }

    if (this.video) {
      this.video.removeEventListener("play", this.scheduleSkipHandler);
      this.video.removeEventListener("pause", this.scheduleSkipHandler);
      this.video.removeEventListener("timeupdate", this.scheduleSkipHandler);
      this.video.removeEventListener(
        "durationchange",
        this.durationChangeHandler,
      );
      this.video = null;
    }

    this.skippedCategories.clear();
  }
}

window.sponsorblock = null;

window.addEventListener(
  "hashchange",
  () => {
    const match = /[?&]v=([^&]+)/.exec(location.hash);
    const videoID = match ? match[1] : null;
    const needsReload =
      videoID &&
      (!window.sponsorblock || window.sponsorblock.videoID != videoID);

    console.info(
      "hashchange",
      videoID,
      window.sponsorblock,
      window.sponsorblock ? window.sponsorblock.videoID : null,
      needsReload,
    );

    if (needsReload) {
      if (window.sponsorblock) {
        try {
          window.sponsorblock.destroy();
        } catch (err) {
          console.warn("window.sponsorblock.destroy() failed!", err);
        }
        window.sponsorblock = null;
      }

      if (configRead("enableSponsorBlock")) {
        window.sponsorblock = new SponsorBlockHandler(videoID);
        window.sponsorblock.init();
      } else {
        console.info("SponsorBlock disabled, not loading");
      }
    }
  },
  false,
);
