import { createPlanners } from '../planners';
import type { LoadedFeed, LoadProgress, Planner } from '../planners/types';
import { downloadFeed, FEED_URL } from './source';
import type { FeedIndex } from './types';

/** A planner that could not be loaded, and is left out of the comparison rather than ending it. */
export interface UnavailablePlanner {
  planner: Planner;
  message: string;
}

export interface FeedSession {
  index: FeedIndex;
  /** The planners that loaded. */
  planners: readonly Planner[];
  unavailable: readonly UnavailablePlanner[];
  loaded: LoadedFeed;
}

/** How far one planner has got with the feed. */
export interface PlannerLoad {
  planner: Planner;
  progress: LoadProgress | null;
  done: boolean;
}

export type FeedStatus =
  | { state: 'idle' }
  | {
      state: 'loading';
      /** The download every planner is fed from. */
      bytesRead: number;
      bytesTotal?: number | undefined;
      downloaded: boolean;
      planners: readonly PlannerLoad[];
    }
  | { state: 'ready'; session: FeedSession }
  | { state: 'failed'; message: string };

type Listener = (status: FeedStatus) => void;

/**
 * The feed is loaded once for the life of the page, not once per component.
 *
 * It is 21MB over the wire and every planner builds hundreds of megabytes of its own out of it, so
 * this is a module-level singleton rather than component state: a second caller joins the load
 * already running instead of starting another. That also makes it survive StrictMode mounting
 * everything twice in development.
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
  const planners = createPlanners();
  const loads = new Map<string, PlannerLoad>(
    planners.map((planner) => [planner.id, { planner, progress: null, done: false }]),
  );

  let bytesRead = 0;
  let bytesTotal: number | undefined;
  let downloaded = false;

  const report = () => {
    publish({
      state: 'loading',
      bytesRead,
      bytesTotal,
      downloaded,
      planners: [...loads.values()],
    });
  };
  report();

  // Fetched once here rather than by each worker, then posted to all of them.
  const bytes = await downloadFeed(url, (read, total) => {
    bytesRead = read;
    bytesTotal = total;
    report();
  });
  downloaded = true;
  report();

  // Concurrently: they are separate workers on separate cores, and each spends most of its time
  // parsing the same bytes.
  type Outcome = { planner: Planner; loaded: LoadedFeed } | { planner: Planner; message: string };

  const outcomes = await Promise.all(
    planners.map(async (planner): Promise<Outcome> => {
      try {
        const loaded = await planner.load(bytes, (progress) => {
          const entry = loads.get(planner.id);
          if (entry) entry.progress = progress;
          report();
        });
        const entry = loads.get(planner.id);
        if (entry) entry.done = true;
        report();
        return { planner, loaded };
      } catch (e) {
        // One planner that cannot load — patterns not published yet, say — is left out rather than
        // taking the comparison down with it.
        planner.terminate();
        loads.delete(planner.id);
        report();
        return { planner, message: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const ready = outcomes.filter(
    (o): o is Extract<Outcome, { loaded: LoadedFeed }> => 'loaded' in o,
  );
  const unavailable = outcomes.filter(
    (o): o is Extract<Outcome, { message: string }> => 'message' in o,
  );

  // Whichever planner described the feed; the rest read the same one and say nothing about it.
  const described = ready.find((o) => o.loaded.index !== undefined);
  if (!described?.loaded.index) {
    throw new Error(
      unavailable[0]?.message ?? 'No planner could read the feed, so there is nothing to compare',
    );
  }

  const feed: FeedSession = {
    index: described.loaded.index,
    planners: ready.map((o) => o.planner),
    unavailable,
    loaded: described.loaded,
  };
  publish({ state: 'ready', session: feed });
  return feed;
}
