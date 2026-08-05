// DeArrow – community-approved video titles & thumbnails.
//
// Queries the DeArrow branding API for each tile and swaps in the most-voted
// title (and, optionally a community timestamp thumbnail) at parse time. Caches
// per video id, and re-applies cached results to later re-renders so a video is
// never left with vanilla metadata once its branding has been fetched.

import { configRead, nativeJSONParse, nativeJSONStringify } from "../config.js";
import { fetchWithTimeout } from "../shared/fetch.js";

// Session cache keyed by video id. Holds the fetch promise while in flight and
// keeps the resolved branding object so subsequent shelves apply it instantly.
const deArrowCache = {};

function applyDeArrow(item, videoId, data, titlesEnabled, thumbnailsEnabled) {
  try {
    if (titlesEnabled && data.titles && data.titles.length > 0) {
      const mostVoted = data.titles.reduce((max, title) =>
        max.votes > title.votes ? max : title,
      );
      if (item.tileRenderer?.metadata?.tileMetadataRenderer?.title) {
        item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText =
          mostVoted.title;
      }
    }

    if (thumbnailsEnabled && data.thumbnails && data.thumbnails.length > 0) {
      const mostVotedThumbnail = data.thumbnails.reduce((max, thumbnail) =>
        max.votes > thumbnail.votes ? max : thumbnail,
      );
      if (
        mostVotedThumbnail.timestamp &&
        item.tileRenderer?.header?.tileHeaderRenderer?.thumbnail
      ) {
        item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails = [
          {
            url: `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${videoId}&time=${mostVotedThumbnail.timestamp}`,
            width: 1280,
            height: 640,
          },
        ];
      }
    }
  } catch (e) {
    console.warn("Error processing DeArrow data:", e);
  }
}

export function deArrowify(items) {
  const titlesEnabled = configRead("enableDeArrowTitles");
  const thumbnailsEnabled = configRead("enableDeArrowThumbnails");
  if (!titlesEnabled && !thumbnailsEnabled) return;

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.adSlotRenderer) {
      items.splice(i, 1);
      continue;
    }
    if (!item.tileRenderer) continue;
    const videoId = item.tileRenderer.contentId;
    if (!videoId) continue;

    const cached = deArrowCache[videoId];
    if (cached) {
      if (cached.data) {
        applyDeArrow(item, videoId, cached.data, titlesEnabled, thumbnailsEnabled);
      }
      continue;
    }

    const promise = fetchWithTimeout(
      `https://sponsor.ajay.app/api/branding?videoID=${videoId}`,
    )
      .then((res) => res.json())
      .then((data) => {
        const entry = deArrowCache[videoId];
        if (entry) entry.data = data;
        applyDeArrow(item, videoId, data, titlesEnabled, thumbnailsEnabled);
      })
      .catch(() => {});
    deArrowCache[videoId] = promise;
  }
}

// Force a re-request for a video (used when the dearrow config flips on late).
export function resetDeArrowCache(videoID) {
  if (videoID) {
    delete deArrowCache[videoID];
    return;
  }
  for (const key in deArrowCache) delete deArrowCache[key];
}

export function deArrowDeepClone(value) {
  return nativeJSONParse(nativeJSONStringify(value));
}