import { createPlanners } from '../planners';
import type { LoadedFeed, LoadProgress, Planner } from '../planners/types';
import { downloadFeed, FEED_URL } from './source';
import type { FeedIndex } from './types';

export interface FeedSession {
  index: FeedIndex;
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
 * It is 21MB over the wire and about half a gigabyte of objects by the time the planner has built
 * its timetable, so this is a module-level singleton rather than component state: a second caller
 * joins the load already running instead of starting another. That also makes it survive
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

  // Fetched here rather than by each worker so that a comparison of several planners downloads the
  // feed once and posts a copy to each.
  const bytes = await downloadFeed(url, (bytesRead, bytesTotal) => {
    publish({
      state: 'loading',
      progress: { phase: 'downloading', bytesRead, bytesTotal, rows: 0 },
    });
  });

  const planners = createPlanners();
  const [first, ...rest] = planners;
  if (!first) throw new Error('There are no planners to compare');

  const report = (progress: LoadProgress) => {
    publish({ state: 'loading', progress });
  };

  // Every planner reads the same feed, so they all describe it the same way; the first to finish
  // is the one the page is named from.
  const loaded = await first.load(bytes, report);
  for (const planner of rest) await planner.load(bytes, report);

  const ready: FeedSession = { index: loaded.index, planners, loaded };
  publish({ state: 'ready', session: ready });
  return ready;
}
