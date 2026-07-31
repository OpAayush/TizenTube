import { configRead } from "../config.js";
import Chapters from "../ui/chapters.js";
import resolveCommand from "../resolveCommand.js";
import {
  timelyAction,
  longPressData,
  MenuServiceItemRenderer,
  ShelfRenderer,
  TileRenderer,
  ButtonRenderer,
} from "../ui/ytUI.js";
import { PatchSettings } from "../ui/customYTSettings.js";
import { t } from "i18next";

const FETCH_TIMEOUT = 5000;
const THUMBNAIL_URLS = [
  "maxresdefault.jpg",
  "sddefault.jpg",
  "hqdefault.jpg",
  "mqdefault.jpg",
  "default.jpg",
];

function createFetchWithTimeout(timeout) {
  return function (url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId),
    );
  };
}

const fetchWithTimeout = createFetchWithTimeout(FETCH_TIMEOUT);

/**
 * This is a minimal reimplementation of the following uBlock Origin rule:
 * https://github.com/uBlockOrigin/uAssets/blob/3497eebd440f4871830b9b45af0afc406c6eb593/filters/filters.txt#L116
 */
const origParse = JSON.parse;
JSON.parse = function () {
  const r = origParse.apply(this, arguments);
  try {
    const adBlockEnabled = configRead('enableAdBlock');
    const signinReminderEnabled = configRead('enableSigninReminder');

    if (r?.playbackContext?.contentPlaybackContext) {
      // Handled by the patched JSON.stringify below (isInlinePlaybackNoAd)
    }

    if (r.adPlacements && adBlockEnabled) {
      r.adPlacements = [];
    }

    if (r.playerAds && adBlockEnabled) {
      r.playerAds = false;
    }

    if (r.adSlots && adBlockEnabled) {
      r.adSlots = [];
    }

    if (r.paidContentOverlay && !configRead('enablePaidPromotionOverlay')) {
      r.paidContentOverlay = null;
    }

    if (r?.streamingData?.adaptiveFormats && configRead('videoPreferredCodec') !== 'any') {
      const preferredCodec = configRead('videoPreferredCodec');
      const hasPreferredCodec = r.streamingData.adaptiveFormats.find(format => format.mimeType.includes(preferredCodec));
      if (hasPreferredCodec) {
        r.streamingData.adaptiveFormats = r.streamingData.adaptiveFormats.filter(format => {
          if (format.mimeType.startsWith('audio/')) return true;
          return format.mimeType.includes(preferredCodec);
        });
      }
    }

    if (
      r?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content
        ?.sectionListRenderer?.contents
    ) {
      if (!signinReminderEnabled) {
        r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents =
          r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.filter(
            (elm) => !elm.feedNudgeRenderer
          );
      }

      if (adBlockEnabled) {
        r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents =
          r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.filter(
            (elm) => !elm.adSlotRenderer
          );

        for (const shelve of r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents) {
          if (shelve.shelfRenderer && shelve.shelfRenderer.content?.horizontalListRenderer?.items) {
            shelve.shelfRenderer.content.horizontalListRenderer.items =
              shelve.shelfRenderer.content.horizontalListRenderer.items.filter(
                (item) => !item.adSlotRenderer
              );
          }
        }
      }

      processShelves(r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents);
    }

    if (r.endscreen && configRead('enableHideEndScreenCards')) {
      r.endscreen = null;
    }

    if (r.messages && Array.isArray(r.messages) && !configRead('enableYouThereRenderer')) {
      r.messages = r.messages.filter(
        (msg) => !msg?.youThereRenderer
      );
    }

    if (!Array.isArray(r) && r?.entries && adBlockEnabled) {
      r.entries = r.entries?.filter(
        (elm) => !elm?.command?.reelWatchEndpoint?.adClientParams?.isAd
      );
    }

    if (r?.title?.runs) {
      PatchSettings(r);
    }

    if (r?.contents?.sectionListRenderer?.contents) {
      processShelves(r.contents.sectionListRenderer.contents);
    }

    if (r?.continuationContents?.sectionListContinuation?.contents) {
      processShelves(r.continuationContents.sectionListContinuation.contents);
    }

    if (r?.continuationContents?.horizontalListContinuation?.items) {
      deArrowify(r.continuationContents.horizontalListContinuation.items);
      hqify(r.continuationContents.horizontalListContinuation.items);
      addLongPress(r.continuationContents.horizontalListContinuation.items);
      r.continuationContents.horizontalListContinuation.items = hideVideo(r.continuationContents.horizontalListContinuation.items);
    }

    if (r?.contents?.tvBrowseRenderer?.content?.tvSecondaryNavRenderer?.sections) {
      for (let i = 0; i < r.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections.length; i++) {
        const section = r.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections[i].tvSecondaryNavSectionRenderer;
        if (!section || !section.tabs) continue;
        if (configRead('sortSubscriptionsByAlphabet')) {
          section.tabs.sort((a, b) => {
            if (a.tabRenderer.selected && !b.tabRenderer.selected) return -1;
            if (!a.tabRenderer.selected && b.tabRenderer.selected) return 1;
            return a.tabRenderer.title.localeCompare(b.tabRenderer.title);
          });
        }
        for (let j = 0; j < section.tabs.length; j++) {
          const tab = section.tabs[j];
          if (tab.tabRenderer.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents) {
            const index = section.tabs.indexOf(tab);
            const clone = tab.tabRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;
            processShelves(clone);
            section.tabs[index].tabRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents = clone;
          }
        }
      }
    }

    if (r?.contents?.singleColumnWatchNextResults?.pivot?.sectionListRenderer) {
      if (!signinReminderEnabled) {
        r.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents =
          r.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents.filter(
            (elm) => !elm.alertWithActionsRenderer
          );
      }
      processShelves(r.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents, false);
      if (window.queuedVideos.videos.length > 0) {
        const queuedVideosClone = window.queuedVideos.videos.slice();
        queuedVideosClone.unshift(TileRenderer(
          'Clear Queue',
          {
            customAction: {
              action: 'CLEAR_QUEUE'
            }
          }));
        r.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents.unshift(ShelfRenderer(
          'Queued Videos',
          queuedVideosClone,
          queuedVideosClone.findIndex(v => v.contentId === window.queuedVideos.lastVideoId) !== -1 ?
            queuedVideosClone.findIndex(v => v.contentId === window.queuedVideos.lastVideoId)
            : 0
        ));
      }
    }

    /*

    Chapters are disabled due to the API removing description data which was used to generate chapters

    if (r?.contents?.singleColumnWatchNextResults?.results?.results?.contents && configRead('enableChapters')) {
      const chapterData = Chapters(r);
      r.frameworkUpdates.entityBatchUpdate.mutations.push(chapterData);
      resolveCommand({
        "clickTrackingParams": "null",
        "loadMarkersCommand": {
          "visibleOnLoadKeys": [
            chapterData.entityKey
          ],
          "entityKeys": [
            chapterData.entityKey
          ]
        }
      });
    }*/
    // Manual SponsorBlock Skips
    if (configRead('sponsorBlockManualSkips').length > 0 && r?.playerOverlays?.playerOverlayRenderer) {
      const manualSkippedSegments = configRead('sponsorBlockManualSkips');
      let timelyActions = [];
      if (window?.sponsorblock?.segments) {
        for (const segment of window.sponsorblock.segments) {
          if (manualSkippedSegments.includes(segment.category)) {
            const timelyActionData = timelyAction(
              t('sponsorblock.toasts.skip', { segment: t(`sponsorblock.segments.${segment.category}`) }),
              'SKIP_NEXT',
              {
                clickTrackingParams: null,
                showEngagementPanelEndpoint: {
                  customAction: {
                    action: 'SKIP',
                    parameters: {
                      time: segment.segment[1]
                    }
                  }
                }
              },
              segment.segment[0] * 1000,
              segment.segment[1] * 1000 - segment.segment[0] * 1000
            );
            timelyActions.push(timelyActionData);
          }
        }
        r.playerOverlays.playerOverlayRenderer.timelyActionRenderers = timelyActions;
      }
    } else if (r?.playerOverlays?.playerOverlayRenderer) {
      r.playerOverlays.playerOverlayRenderer.timelyActionRenderers = [];
    }

    if (r?.transportControls?.transportControlsRenderer?.promotedActions && configRead('enableSponsorBlockHighlight')) {
      if (window?.sponsorblock?.segments) {
        const category = window.sponsorblock.segments.find(seg => seg.category === 'poi_highlight');
        if (category) {
          r.transportControls.transportControlsRenderer.promotedActions.push({
            type: 'TRANSPORT_CONTROLS_BUTTON_TYPE_SPONSORBLOCK_HIGHLIGHT',
            button: {
              buttonRenderer: ButtonRenderer(
                false,
                t('sponsorblock.toasts.skipToHighlight'),
                'SKIP_NEXT',
                {
                  clickTrackingParams: null,
                  customAction: {
                    action: 'SKIP',
                    parameters: {
                      time: category.segment[0]
                    }
                  }
                })
            }
          });
        }
      }
    }
  } catch (e) {
    console.error('An error occured while processing the JSON:', e);
  }

  return r;
};

// Fix playback issues
const origStringify = JSON.stringify;
JSON.stringify = function (value, replacer, space) {
  const playbackContext = value?.playbackContext?.contentPlaybackContext;
  if (playbackContext && !playbackContext.isInlinePlaybackNoAd) {
    // Mutate in place instead of the previous clone round-trip:
    // avoids a full serialize + reparse of every player response.
    playbackContext.isInlinePlaybackNoAd = true;
    return origStringify.call(this, value, replacer, space);
  }
  return origStringify.call(this, value, replacer, space);
};
window.JSON.stringify = JSON.stringify;
// Patch JSON.parse to use the custom one
window.JSON.parse = JSON.parse;
for (const key in window._yttv) {
  if (
    window._yttv[key] &&
    window._yttv[key].JSON &&
    window._yttv[key].JSON.parse
  ) {
    window._yttv[key].JSON.parse = JSON.parse;
  }
}

function processShelves(shelves, shouldAddPreviews = true) {
  const removeShorts = !configRead("enableShorts");
  for (let i = shelves.length - 1; i >= 0; i--) {
    const shelve = shelves[i];
    if (!shelve.shelfRenderer) continue;
    if (!shelve.shelfRenderer.content?.horizontalListRenderer?.items) continue;

    // Skip processing entirely for shelves that will be removed
    if (
      removeShorts &&
      shelve.shelfRenderer.tvhtml5ShelfRendererType ===
        "TVHTML5_SHELF_RENDERER_TYPE_SHORTS"
    ) {
      shelves.splice(i, 1);
      continue;
    }

    const items = shelve.shelfRenderer.content.horizontalListRenderer.items;
    deArrowify(items);
    hqify(items);
    addLongPress(items);
    if (shouldAddPreviews) {
      addPreviews(items);
    }
    if (removeShorts) {
      shelve.shelfRenderer.content.horizontalListRenderer.items = items.filter(
        (item) =>
          !item.tileRenderer ||
          (item.tileRenderer.tvhtml5ShelfRendererType !==
            "TVHTML5_TILE_RENDERER_TYPE_SHORTS" &&
            !item.tileRenderer.onSelectCommand?.reelWatchEndpoint),
      );
    }
    shelve.shelfRenderer.content.horizontalListRenderer.items = hideVideo(
      shelve.shelfRenderer.content.horizontalListRenderer.items,
    );
  }
}

function addPreviews(items) {
  if (!configRead("enablePreviews")) return;
  for (const item of items) {
    if (item.tileRenderer) {
      const watchEndpoint = item.tileRenderer.onSelectCommand;
      if (!watchEndpoint) continue;
      if (item.tileRenderer?.onFocusCommand?.playbackEndpoint) continue;
      if (item.tileRenderer?.onFocusCommand?.commandExecutorCommand) continue;
      const copiedEndpoint = JSON.parse(JSON.stringify(watchEndpoint));
      item.tileRenderer.onFocusCommand = {
        startInlinePlaybackCommand: {
          blockAdoption: true,
          caption: false,
          delayMs: 3000,
          durationMs: 40000,
          muted: false,
          restartPlaybackBeforeSeconds: 10,
          resumeVideo: true,
          playbackEndpoint: copiedEndpoint,
        },
      };
    }
  }
}

// Session cache so repeated/re-rendered shelves don't re-request the API
const deArrowCache = {};

function deArrowify(items) {
  const deArrowEnabled = configRead("enableDeArrow");
  const deArrowThumbnails = configRead("enableDeArrowThumbnails");
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.adSlotRenderer) {
      items.splice(i, 1);
      continue;
    }
    if (!item.tileRenderer || !deArrowEnabled) continue;
    const videoID = item.tileRenderer.contentId;
    if (!videoID || deArrowCache[videoID]) continue;

    const promise = fetchWithTimeout(
      `https://sponsor.ajay.app/api/branding?videoID=${videoID}`,
    )
      .then((res) => res.json())
      .then((data) => {
        try {
          if (data.titles && data.titles.length > 0) {
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

// Memoize the generated thumbnail array per video id so repeated shelves
// and re-processed items don't rebuild/recursively re-walk the tile data
const hqThumbnailsCache = {};

function buildHqThumbnails(videoID) {
  const thumbnails = [];
  for (const filename of THUMBNAIL_URLS) {
    thumbnails.push({
      url: `https://i.ytimg.com/vi/${videoID}/${filename}`,
      width: 1280,
      height: 720,
    });
  }
  return thumbnails;
}

function hqify(items) {
  if (!configRead("enableHqThumbnails")) return;
  for (const item of items) {
    if (!item.tileRenderer) continue;
    if (item.tileRenderer.style !== "TILE_STYLE_YTLR_DEFAULT") continue;

    try {
      const videoID = item.tileRenderer.onSelectCommand?.watchEndpoint?.videoId;
      if (!videoID) continue;

      // Skip tiles that were already upgraded with the cached array
      const primaryThumbnails =
        item.tileRenderer.header?.tileHeaderRenderer?.thumbnail?.thumbnails;
      if (primaryThumbnails === hqThumbnailsCache[videoID]) continue;

      const thumbnails =
        hqThumbnailsCache[videoID] || buildHqThumbnails(videoID);
      hqThumbnailsCache[videoID] = thumbnails;

      // Set thumbnails in the primary location
      if (item.tileRenderer.header?.tileHeaderRenderer?.thumbnail?.thumbnails) {
        item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails =
          thumbnails;
      }

      // Also check and set thumbnails in onFocusCommand if it exists
      if (
        item.tileRenderer.onFocusCommand?.startInlinePlaybackCommand
          ?.playbackEndpoint?.startPlaylistItemEndpoint?.playlistItemData
          ?.thumbnail?.thumbnails
      ) {
        item.tileRenderer.onFocusCommand.startInlinePlaybackCommand.playbackEndpoint.startPlaylistItemEndpoint.playlistItemData.thumbnail.thumbnails =
          thumbnails;
      }

      // Check for any other thumbnail locations in the tile renderer
      const checkAndSetThumbnails = (obj) => {
        if (!obj || typeof obj !== "object") return;

        for (const key in obj) {
          if (key === "thumbnails" && Array.isArray(obj[key])) {
            // Don't override if it's a small thumbnail array (likely icons)
            if (
              obj[key].length > 0 &&
              obj[key][0].width &&
              obj[key][0].width > 100
            ) {
              obj[key] = thumbnails;
            }
          } else if (typeof obj[key] === "object") {
            checkAndSetThumbnails(obj[key]);
          }
        }
      };

      // Deep search for any thumbnail arrays in onFocusCommand
      if (item.tileRenderer.onFocusCommand) {
        checkAndSetThumbnails(item.tileRenderer.onFocusCommand);
      }
    } catch (e) {
      console.warn("Error processing thumbnail:", e);
    }
  }
}

// Build a minimal tile-shaped payload for the queue instead of deep-cloning
// the whole tile into every long-press menu (halves response payload size)
function makeQueuePayload(item) {
  const src = item.tileRenderer;
  const tile = {};
  if (src.contentType !== undefined) tile.contentType = src.contentType;
  if (src.style !== undefined) tile.style = src.style;
  if (src.contentId !== undefined) tile.contentId = src.contentId;
  if (src.trackingParams !== undefined) tile.trackingParams = src.trackingParams;
  if (src.metadata !== undefined)
    tile.metadata = JSON.parse(JSON.stringify(src.metadata));
  if (src.header !== undefined)
    tile.header = JSON.parse(JSON.stringify(src.header));
  if (src.onSelectCommand !== undefined)
    tile.onSelectCommand = JSON.parse(JSON.stringify(src.onSelectCommand));
  return { tileRenderer: tile };
}

function addLongPress(items) {
  for (const item of items) {
    if (!item.tileRenderer) continue;
    if (item.tileRenderer.style !== 'TILE_STYLE_YTLR_DEFAULT') continue;
    if (item.tileRenderer.onLongPressCommand?.showMenuCommand?.menu?.menuRenderer?.items) {
        const copiedItem = makeQueuePayload(item);
        item.tileRenderer.onLongPressCommand.showMenuCommand.menu.menuRenderer.items.push(MenuServiceItemRenderer('Add to Queue', {
          clickTrackingParams: null,
          playlistEditEndpoint: {
            customAction: {
              action: 'ADD_TO_QUEUE',
              parameters: copiedItem
            }
          }
        }));
      continue;
    }
    if (!configRead('enableLongPress')) continue;
    if (!item.tileRenderer?.metadata?.tileMetadataRenderer) continue;
    if (!item.tileRenderer?.header?.tileHeaderRenderer?.thumbnail?.thumbnails) continue;
    if (!item.tileRenderer.onSelectCommand?.watchEndpoint) continue;
    const copiedItem = makeQueuePayload(item);
    const subtitleNode = copiedItem.tileRenderer.metadata.tileMetadataRenderer.lines?.[0]?.lineRenderer?.items?.[0]?.lineItemRenderer?.text;
    if (!subtitleNode) continue;
    const subtitle = subtitleNode;
    const data = longPressData({
      videoId: copiedItem.tileRenderer.contentId,
      thumbnails: copiedItem.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails,
      title: copiedItem.tileRenderer.metadata.tileMetadataRenderer.title.simpleText,
      subtitle: subtitle.runs ? subtitle.runs[0].text : subtitle.simpleText,
      watchEndpointData: copiedItem.tileRenderer.onSelectCommand.watchEndpoint,
      item: copiedItem
    });
    item.tileRenderer.onLongPressCommand = data;
  }
}

function hideVideo(items) {
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
