// Hide watched videos.
//
// Removes tiles whose resume playback progress bar exceeds the configured
// threshold, but only on the pages the user opted in to.

import { configRead } from "../config.js";

export function hideVideo(items) {
  if (!configRead("enableHideWatchedVideos")) return items;
  const pages = configRead("hideWatchedVideosPages");
  if (!pages || !pages.length) return items;
  const threshold = configRead("hideWatchedVideosThreshold");
  const hash = location.hash.substring(1);
  const pageName =
    hash === "/"
      ? "home"
      : hash.startsWith("/search")
        ? "search"
        : (hash
            .split("?")[1]
            ?.split("&")[0]
            ?.split("=")[1]
            ?.replace("FE", "")
            ?.replace("topics_", "") ?? "");
  if (!pages.includes(pageName)) return items;
  return items.filter((item) => {
    if (!item.tileRenderer) return true;
    const progressBar =
      item.tileRenderer.header?.tileHeaderRenderer?.thumbnailOverlays?.find(
        (overlay) => overlay.thumbnailOverlayResumePlaybackRenderer,
      )?.thumbnailOverlayResumePlaybackRenderer;
    if (!progressBar) return true;
    const percentWatched = progressBar.percentDurationWatched || 0;
    return percentWatched <= threshold;
  });
}