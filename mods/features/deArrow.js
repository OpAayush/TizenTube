// DeArrow – community-approved video titles & thumbnails.
//
// Queries the DeArrow branding API for each tile and swaps in the most-voted
// title (and, optionally, a community timestamp thumbnail) at response-parse
// time. Caches per video id so repeated shelves don't re-request.

import { configRead, nativeJSONParse, nativeJSONStringify } from "../config.js";
import { fetchWithTimeout } from "../shared/fetch.js";

// Session cache so repeated/re-rendered shelves don't re-request the API
const deArrowCache = {};

export function deArrowify(items) {
  const deArrowTitles = configRead("enableDeArrowTitles");
  const deArrowThumbnails = configRead("enableDeArrowThumbnails");
  if (!deArrowTitles && !deArrowThumbnails) return;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.adSlotRenderer) {
      items.splice(i, 1);
      continue;
    }
    if (!item.tileRenderer) continue;
    const videoID = item.tileRenderer.contentId;
    if (!videoID || deArrowCache[videoID]) continue;

    const promise = fetchWithTimeout(
      `https://sponsor.ajay.app/api/branding?videoID=${videoID}`,
    )
      .then((res) => res.json())
      .then((data) => {
        try {
          if (
            deArrowTitles &&
            data.titles &&
            data.titles.length > 0
          ) {
            const mostVoted = data.titles.reduce((max, title) =>
              max.votes > title.votes ? max : title,
            );
            if (item.tileRenderer?.metadata?.tileMetadataRenderer?.title) {
              item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText =
                mostVoted.title;
            }
          }

          if (
            data.thumbnails &&
            data.thumbnails.length > 0 &&
            deArrowThumbnails
          ) {
            const mostVotedThumbnail = data.thumbnails.reduce(
              (max, thumbnail) =>
                max.votes > thumbnail.votes ? max : thumbnail,
            );
            if (
              mostVotedThumbnail.timestamp &&
              item.tileRenderer?.header?.tileHeaderRenderer?.thumbnail
            ) {
              item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails =
                [
                  {
                    url: `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${videoID}&time=${mostVotedThumbnail.timestamp}`,
                    width: 1280,
                    height: 640,
                  },
                ];
            }
          }
        } catch (e) {
          console.warn("Error processing DeArrow data:", e);
        }
      })
      .catch(() => {});
    deArrowCache[videoID] = promise;
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