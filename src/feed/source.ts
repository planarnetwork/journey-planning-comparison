/**
 * Where the feed comes from.
 *
 * gb-transit publishes the feed it builds on its own GitHub Pages site, which is the same origin as
 * this one — `planarnetwork.github.io` — so the deployed app reads it with no proxy and no CORS
 * involved at all. Away from that origin, in development, it is still readable: GitHub Pages sends
 * `Access-Control-Allow-Origin: *` on every response.
 *
 * Not the GitHub release the feed is cut from. A release asset is served from
 * `release-assets.githubusercontent.com` with no such header, so no page can fetch one — the
 * browser refuses it from `github.io` exactly as it does from localhost.
 *
 * Point `VITE_FEED_URL` at a local copy to work against a feed that is not the current one.
 */
export const FEED_URL =
  import.meta.env.VITE_FEED_URL ?? 'https://planarnetwork.github.io/gb-transit/gtfs.zip';

/**
 * The transfer patterns built from that feed, published beside it.
 *
 * Two shapes of the same thing. The whole set is one brotli file of tens of megabytes, which the
 * eager planner reads in full; the directory holds one file per station, which the lazy planner
 * fetches as a query asks for one — about three times the bytes in total, none of it read until
 * it is wanted.
 */
export const PATTERN_FILE_URL =
  import.meta.env.VITE_PATTERN_FILE_URL ??
  'https://planarnetwork.github.io/gb-transit/transfer-patterns.br';

/** Must end in a slash, or the last segment reads as a filename and is replaced. */
export const PATTERN_DIRECTORY_URL =
  import.meta.env.VITE_PATTERN_DIRECTORY_URL ??
  'https://planarnetwork.github.io/gb-transit/transfer-patterns/';

/**
 * Fetch the feed, reporting as it arrives.
 *
 * The bytes are collected rather than streamed on, because two workers each want a copy of them:
 * the planner, which builds a timetable, and the reader, which keeps what the planner discards.
 */
export async function downloadFeed(
  url: string,
  onProgress: (bytesRead: number, bytesTotal: number | undefined) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) {
    throw new Error(`The feed could not be fetched: ${response.status} ${response.statusText}`);
  }

  const declared = response.headers.get('content-length');
  const total = declared ? Number(declared) : undefined;
  if (!response.body) return response.arrayBuffer();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    read += value.length;
    onProgress(read, total);
  }

  const bytes = new Uint8Array(read);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes.buffer;
}
