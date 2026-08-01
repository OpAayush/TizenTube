// Cast receiver. When a phone casts to the TV, the TizenBrew standalone app
// loads this module's appPath with the cast payload appended as URL query
// params (e.g. youtube.com/tv?v=VIDEOID&... or ...?search_query=...). The
// userscript previously ignored location.search entirely, so casts that carry
// a search query or playlist never synced with the TV UI. This module reads the
// query string once, maps it to a resolveCommand endpoint command, and
// dispatches it once the YouTube TV app (window._yttv) is ready.
import resolveCommand from "../resolveCommand.js";

function parseQuery(queryString) {
  if (!queryString || queryString.length <= 1) return {};
  const params = {};
  const pairs = queryString.substring(1).split("&");
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      params[decodeURIComponent(pair.replace(/\+/g, " "))] = "";
      continue;
    }
    const key = decodeURIComponent(pair.substring(0, eq).replace(/\+/g, " "));
    const value = decodeURIComponent(pair.substring(eq + 1).replace(/\+/g, " "));
    params[key] = value;
  }
  return params;
}

function buildCommand(params) {
  if (!params || typeof params !== "object") return null;

  if (params.v) {
    const watch = { videoId: params.v };
    if (params.list) watch.playlistId = params.list;
    return { watchEndpoint: watch };
  }

  if (params.list) {
    return { playlistEndpoint: { playlistId: params.list } };
  }

  const query = params.search_query || params.q;
  if (query) {
    return { searchEndpoint: { query } };
  }

  if (params.browseId) {
    return { browseEndpoint: { browseId: params.browseId } };
  }

  return null;
}

function dispatchWhenReady(cmd) {
  if (!cmd) return;
  const dispatch = () => {
    try {
      resolveCommand(cmd);
    } catch (err) {
      // Best-effort; never break the rest of the script.
    }
  };

  if (typeof window !== "undefined" && window._yttv && Object.keys(window._yttv).length > 0) {
    dispatch();
    return;
  }

  // Wait for the app to be ready before dispatching.
  let attempts = 0;
  const interval = setInterval(() => {
    attempts += 1;
    const ready =
      typeof window !== "undefined" &&
      window._yttv &&
      Object.keys(window._yttv).length > 0;
    if (ready || attempts > 50) {
      clearInterval(interval);
      if (ready) dispatch();
    }
  }, 200);
}

try {
  const params = parseQuery(location.search);
  dispatchWhenReady(buildCommand(params));
} catch (err) {
  // location.search may be unavailable in odd embedded contexts; ignore.
}
