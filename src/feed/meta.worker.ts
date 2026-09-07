import { type FeedMeta, readFeedMeta } from './readFeed';
import type { MetaRequest, MetaResponse } from './types';

/**
 * Holds what the feed knows and the planner does not keep, so the page can ask about a trip
 * without holding a table of every trip in the country.
 */
let meta: FeedMeta | undefined;

// `self` is typed as a Window here, because the DOM lib and the WebWorker lib cannot both be on
// without colliding, and the rest of the app needs the DOM one.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MetaRequest>) => void) | null;
  postMessage: (message: MetaResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  handle(request)
    .catch(
      (e: unknown): MetaResponse => ({
        id: request.id,
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      }),
    )
    .then((response) => {
      scope.postMessage(response);
    });
};

async function handle(request: MetaRequest): Promise<MetaResponse> {
  switch (request.type) {
    case 'load': {
      meta = await readFeedMeta(new Uint8Array(request.bytes));
      return { id: request.id, type: 'loaded', index: meta.index };
    }
    case 'trips': {
      if (!meta) throw new Error('No feed has been read yet');
      const describe = meta.describe;
      return { id: request.id, type: 'trips', meta: request.ids.map((id) => describe(id)) };
    }
  }
}
