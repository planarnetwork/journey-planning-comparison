import { createPlanners } from '../planners';
import type { LoadedFeed, LoadProgress, Planner } from '../planners/types';
import { createFeedReader, type FeedReader } from './FeedReader';
import { downloadFeed, FEED_URL } from './source';
import type { FeedIndex } from './types';

export interface FeedSession {
  index: FeedIndex;
  reader: FeedReader;
  planners: readonly Planner[];
  loaded: LoadedFeed;
}

export type FeedStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: LoadProgress }
  | { state: 'ready'; session: FeedSession }
  | { state: 'failed'; message: string };

type Listener = (status: FeedStatus) => void;

/**
 * The feed is loaded once for the life of the page, not once per component.
 *
 * It is 21MB over the wire and about half a gigabyte of objects by the time both workers have
 * built what they build, so this is a module-level singleton rather than component state: a second
 * caller joins the load already running instead of starting another. That also makes it survive
 * StrictMode mounting everything twice in development.
 */
let session: Promise<FeedSession> | undefined;
let current: FeedStatus = { state: 'idle' };
const listeners = new Set<Listener>();

function publish(status: FeedStatus): void {
  current = status;
  for (const listener of listeners) listener(status);
}

export const feedStatus = (): FeedStatus => current;

export function watchFeed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openFeed(url: string = FEED_URL): Promise<FeedSession> {
  session ??= load(url).catch((e: unknown) => {
    publish({ state: 'failed', message: e instanceof Error ? e.message : String(e) });
    // Let the next caller try again rather than handing back the failure for ever.
    session = undefined;
    throw e;
  });
  return session;
}

async function load(url: string): Promise<FeedSession> {
  publish({ state: 'loading', progress: { phase: 'downloading', bytesRead: 0, rows: 0 } });

  const bytes = await downloadFeed(url, (bytesRead, bytesTotal) => {
    publish({
      state: 'loading',
      progress: { phase: 'downloading', bytesRead, bytesTotal, rows: 0 },
    });
  });

  // The reader goes first and takes about a second, so the station list is answering while the
  // planner is still building a timetable out of the same bytes.
  const reader = createFeedReader();
  publish({
    state: 'loading',
    progress: {
      phase: 'reading',
      bytesRead: bytes.byteLength,
      bytesTotal: bytes.byteLength,
      rows: 0,
    },
  });
  const index = await reader.load(bytes);

  const planners = createPlanners();
  let loaded: LoadedFeed = { stops: index.codes.length, trips: index.trips };
  for (const planner of planners) {
    loaded = await planner.load(bytes, { index, reader }, (progress) => {
      publish({ state: 'loading', progress });
    });
  }

  const ready: FeedSession = { index, reader, planners, loaded };
  publish({ state: 'ready', session: ready });
  return ready;
}
