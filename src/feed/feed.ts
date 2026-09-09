import { createPlanners } from '../planners';
import type { LoadProgress, Planner } from '../planners/types';
import { describeFeed } from './reader';
import { downloadFeed, FEED_URL } from './source';
import type { FeedIndex, GroupIndex } from './types';

/** A planner that could not be loaded, and is left out of the comparison rather than ending it. */
export interface UnavailablePlanner {
  planner: Planner;
  message: string;
}

export interface FeedSession {
  index: FeedIndex;
  /**
   * The station groups a query may be asked in. Kept beside the index rather than in it: a journey
   * is planned between stations and named in them, and never has to say which groups it touched.
   */
  groups: GroupIndex;
  /** The planners that loaded. */
  planners: readonly Planner[];
  unavailable: readonly UnavailablePlanner[];
  /** Trips in the feed, for the header to count. */
  trips: number;
}

/**
 * How far one reader of the feed has got.
 *
 * The page is one of them: it reads the feed for the names and the groups, beside the planners
 * reading it for their timetables. All of them are given the same bytes and all of them parse.
 */
export interface FeedLoad {
  /** The planner this is, or absent for the page's own reading. */
  planner?: Planner | undefined;
  label: string;
  sub: string;
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
      readers: readonly FeedLoad[];
    }
  | { state: 'ready'; session: FeedSession }
  | { state: 'failed'; message: string };

type Listener = (status: FeedStatus) => void;

/**
 * The feed is loaded once for the life of the page, not once per component.
 *
 * It is 21MB over the wire and every reader of it builds hundreds of megabytes of its own out of
 * it, so this is a module-level singleton rather than component state: a second caller joins the
 * load already running instead of starting another. That also makes it survive StrictMode mounting
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

  // The page's own reading first in the list, because it is the one everything else is named by.
  const page: FeedLoad = {
    label: 'This page',
    sub: 'station names and groups',
    progress: null,
    done: false,
  };
  const loads = new Map<string, FeedLoad>(
    planners.map((planner) => [
      planner.id,
      { planner, label: planner.name, sub: planner.sub, progress: null, done: false },
    ]),
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
      readers: [page, ...loads.values()],
    });
  };
  report();

  // Downloaded once here and posted to every worker, so a comparison of several planners fetches
  // 21MB rather than 21MB each. What they each pay is the parsing.
  const bytes = await downloadFeed(url, (read, total) => {
    bytesRead = read;
    bytesTotal = total;
    report();
  });
  downloaded = true;
  report();

  // Concurrently: they are separate workers on separate cores, and each spends most of its time
  // parsing the same bytes into something of its own.
  type Outcome = { planner: Planner } | { planner: Planner; message: string };

  const [described, outcomes] = await Promise.all([
    describeFeed(bytes, (progress) => {
      page.progress = progress;
      report();
    }).then((description) => {
      page.done = true;
      report();
      return description;
    }),
    Promise.all(
      planners.map(async (planner): Promise<Outcome> => {
        try {
          await planner.load(bytes, (progress) => {
            const entry = loads.get(planner.id);
            if (entry) entry.progress = progress;
            report();
          });
          const entry = loads.get(planner.id);
          if (entry) entry.done = true;
          report();
          return { planner };
        } catch (e) {
          // One planner that cannot load — patterns not published yet, say — is left out rather
          // than taking the comparison down with it.
          planner.terminate();
          loads.delete(planner.id);
          report();
          return { planner, message: e instanceof Error ? e.message : String(e) };
        }
      }),
    ),
  ]);

  const unavailable = outcomes.filter(
    (o): o is Extract<Outcome, { message: string }> => 'message' in o,
  );
  const out = new Set(unavailable.map((o) => o.planner.id));

  const feed: FeedSession = {
    index: described.index,
    groups: described.groups,
    planners: planners.filter((planner) => !out.has(planner.id)),
    unavailable,
    trips: described.trips,
  };
  publish({ state: 'ready', session: feed });
  return feed;
}
