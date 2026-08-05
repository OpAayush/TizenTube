// Video previews (inline playback on focus).
//
// Adds an onFocusCommand to every video tile so hovering a tile starts an
// inline preview of the video, exactly like the official client.

import { configRead, nativeJSONParse, nativeJSONStringify } from "../config.js";

export function addPreviews(items) {
  if (!configRead("enablePreviews")) return;
  for (const item of items) {
    if (item.tileRenderer) {
      const watchEndpoint = item.tileRenderer.onSelectCommand;
      if (!watchEndpoint) continue;
      if (item.tileRenderer?.onFocusCommand?.playbackEndpoint) continue;
      if (item.tileRenderer?.onFocusCommand?.commandExecutorCommand) continue;
      const copiedEndpoint = nativeJSONParse(nativeJSONStringify(watchEndpoint));
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