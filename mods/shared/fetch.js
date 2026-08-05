// Shared fetch helpers. Centralises the AbortController-based timeout wrapper so
// network-calling features (DeArrow, SponsorBlock, web config, updater) reuse a
// single implementation instead of each inlining their own.

export const FETCH_TIMEOUT = 5000;

export function createFetchWithTimeout(timeout) {
  return function (url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId),
    );
  };
}

export const fetchWithTimeout = createFetchWithTimeout(FETCH_TIMEOUT);