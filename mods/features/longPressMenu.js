// Long-press video menu.
//
// Attaches a long-press menu to every video tile (Play, Watch Later, Playlist,
// Add to Queue). Builds a minimal tile-shaped payload for the queue instead of
// deep-cloning the whole tile into every menu (halves response payload size).

import { configRead, nativeJSONParse, nativeJSONStringify } from "../config.js";
import { longPressData, MenuServiceItemRenderer } from "../ui/ytUI.js";

// Build a minimal tile-shaped payload for the queue
function makeQueuePayload(item) {
  const src = item.tileRenderer;
  const tile = {};
  if (src.contentType !== undefined) tile.contentType = src.contentType;
  if (src.style !== undefined) tile.style = src.style;
  if (src.contentId !== undefined) tile.contentId = src.contentId;
  if (src.trackingParams !== undefined) tile.trackingParams = src.trackingParams;
  if (src.metadata !== undefined)
    tile.metadata = nativeJSONParse(nativeJSONStringify(src.metadata));
  if (src.header !== undefined)
    tile.header = nativeJSONParse(nativeJSONStringify(src.header));
  if (src.onSelectCommand !== undefined)
    tile.onSelectCommand = nativeJSONParse(nativeJSONStringify(src.onSelectCommand));
  return { tileRenderer: tile };
}

export function addLongPress(items) {
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

export { makeQueuePayload };