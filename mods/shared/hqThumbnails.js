// Shared thumbnail-quality helpers.
//
// Both the response-level hqify (in features/hqThumbnails.js) and the DOM-level
// focus observer (features/hqThumbnailsFocusObserver.js) need the same knowledge
// of thumbnail filename tiers and how to extract a video id from a thumbnail URL.
// Keeping it here avoids two divergent copies of THUMBNAIL_URLS / parsing.

import { configRead } from "../config.js";

export const THUMBNAIL_URLS = [
  "maxresdefault.jpg",
  "sddefault.jpg",
  "hqdefault.jpg",
  "mqdefault.jpg",
  "default.jpg",
];

// Read the hi-res tier actually available for a video.
//
// maxresdefault is not generated for every video; when it 404s the observer
// falls back to hqdefault. Caching per video id avoids re-probing on every
// re-render. Exported so the response-level hqify and the DOM observer share one
// probe cache.
export const hqQualityCache = {};
export const hqPendingTesters = {};

export function extractVideoIdFromThumbnailUrl(url) {
  if (!url) return null;
  if (!url.includes("i.ytimg.com/vi/")) return null;
  const match = url.match(/\/vi\/([a-zA-Z0-9_-]+)\//);
  return match ? match[1] : null;
}

// Probe for the best available quality for a video id and call back with the
// winner ("maxresdefault.jpg" or "hqdefault.jpg"). Deduplicates concurrent
// probes for the same video.
export function probeBestThumbnailQuality(videoId, onResult) {
  const cached = hqQualityCache[videoId];
  if (cached) {
    onResult(cached);
    return;
  }
  if (hqPendingTesters[videoId]) return;

  hqPendingTesters[videoId] = true;
  const maxresUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  const tester = new Image();
  tester.onload = function () {
    hqPendingTesters[videoId] = false;
    if (this.naturalWidth === 120 && this.naturalHeight === 90) {
      hqQualityCache[videoId] = "hqdefault.jpg";
      onResult("hqdefault.jpg");
    } else {
      hqQualityCache[videoId] = "maxresdefault.jpg";
      onResult("maxresdefault.jpg");
    }
  };
  tester.onerror = function () {
    hqPendingTesters[videoId] = false;
    hqQualityCache[videoId] = "hqdefault.jpg";
    onResult("hqdefault.jpg");
  };
  tester.src = maxresUrl;
}

// Whether a thumbnail array looks like a real video thumbnail (vs a small icon
// set) so deep walks don't clobber icon arrays.
export function isVideoThumbnailArray(thumbnails) {
  return (
    Array.isArray(thumbnails) &&
    thumbnails.length > 0 &&
    thumbnails[0].width &&
    thumbnails[0].width > 100
  );
}

export function isHqThumbnailsEnabled() {
  return configRead("enableHqThumbnails");
}