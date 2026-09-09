import { loadGTFS } from '@gb-transit/gtfs-loader';
import { buildIndex } from './buildIndex';
import { toGroups } from './groups';
import type { ReaderMessage, ReaderRequest } from './reader.protocol';

/**
 * Reads the feed for the page, in a worker of its own.
 *
 * The planners each read it too, into whatever they scan. This one reads it for everything else:
 * the station names in the autocomplete, the groups a query may be asked in, and the operator a leg
 * belongs to. It is a fourth reading of the same bytes and the same five seconds of parsing, which
 * is the price of the page not depending on which planner happened to load — nothing here has to
 * ask raptor for a station name, and a planner's protocol never has to grow a field because the
 * page wanted something new out of the feed.
 *
 * What crosses back is a few thousand stations and a hundred routes. The feed itself dies with the
 * worker as soon as it has been described, so the memory goes back rather than being held for the
 * life of the page.
 */
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ReaderRequest>) => void) | null;
  postMessage: (message: ReaderMessage) => void;
};

scope.onmessage = (event) => {
  describe(event.data)
    .catch(
      (e: unknown): ReaderMessage => ({
        type: 'failed',
        message: e instanceof Error ? e.message : String(e),
      }),
    )
    .then((message) => {
      scope.postMessage(message);
    });
};

async function describe(request: ReaderRequest): Promise<ReaderMessage> {
  const feed = await loadGTFS(new Uint8Array(request.bytes), {
    onProgress: (progress) =>
      scope.postMessage({
        type: 'progress',
        progress: {
          phase: progress.phase,
          bytesRead: progress.bytesRead,
          bytesTotal: progress.bytesTotal,
          entry: progress.entry,
          rows: progress.rows,
        },
      }),
  });

  const index = buildIndex(Object.values(feed.stops), feed.routes, feed.agencies);

  return {
    type: 'described',
    index,
    // Areas are read straight off the feed here. A journey planner keeps none of them — an area is
    // a fares construct with no part in planning — so this is the only place they survive.
    groups: toGroups(feed.areas, index.stops),
    trips: feed.trips.length,
  };
}
