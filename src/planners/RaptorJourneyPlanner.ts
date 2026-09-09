import {
  type AsyncPlanner,
  type LoadedFeed as ClientFeed,
  ParallelDepartAfterQuery,
  PlannerClient,
} from 'raptor-journey-planner';
import { version } from 'raptor-journey-planner/package.json';
import type { FeedIndex } from '../feed/types';
import { runProfileQuery } from './profile';
import type { PlainJourney } from './toJourney';
import type {
  LoadedFeed,
  LoadProgress,
  Planner,
  PlannerQuery,
  PlannerRun,
  Threaded,
} from './types';

/**
 * planarnetwork/raptor, driven through the worker client the package ships.
 *
 * The package answers one question — the first journeys departing after a time — so a profile of
 * several departures is that question asked again from just after each answer, which is why the
 * comparison reports a query count alongside the clock.
 *
 * It can be given more than one worker. A scan is synchronous and a worker has one thread, so the
 * only way to run two scans at once is to have two of them; the package's ParallelDepartAfterQuery
 * is what hands a query to whichever is least busy. That makes a difference only where the
 * searches are independent of each other, which of the queries here is a via query and its onward
 * legs — a plain profile has to wait for each answer to know where to look next.
 */
export class RaptorJourneyPlanner implements Planner, Threaded {
  readonly id = 'rjp';
  readonly name = 'RAPTOR';
  readonly sub = 'round-based, depart-after';
  readonly pkg = 'raptor-journey-planner';
  readonly version = version;
  readonly hue = 65;

  private clients: PlannerClient[] = [];
  private pool: ParallelDepartAfterQuery | undefined;
  /**
   * The feed as it arrived, kept so the thread count can be changed without downloading it again.
   * It is 21MB beside the hundreds of megabytes each worker builds out of it.
   */
  private bytes: ArrayBuffer | undefined;
  private count = 1;
  /** Whatever is building workers, so that a query waits for it rather than finding none. */
  private opening: Promise<unknown> = Promise.resolve();

  get threads(): number {
    return this.count;
  }

  async load(
    bytes: ArrayBuffer,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<LoadedFeed> {
    this.bytes = bytes;
    const loaded = await this.open(this.count, onProgress);

    return { stops: loaded.stops, trips: loaded.trips };
  }

  /**
   * Scan on `count` workers from now on.
   *
   * The workers in hand are stopped before the new ones are built rather than after: each holds a
   * timetable of its own, and overlapping them would ask the machine to hold two sets of them at
   * the moment it is least able to. The planner is unusable in between, which is why a query made
   * while this is running waits for it.
   */
  setThreads(count: number, onProgress?: (progress: LoadProgress) => void): Promise<void> {
    this.count = count;
    // Chained rather than started, so clicking through several counts rebuilds once per click in
    // the order they were asked for instead of racing.
    const done = this.opening.then(async () => {
      if (this.count !== count || this.clients.length === count) return;
      this.stop();
      await this.open(count, onProgress);
    });
    this.opening = done.catch(() => undefined);
    return done;
  }

  async plan(query: PlannerQuery, feed: FeedIndex): Promise<PlannerRun> {
    await this.opening;
    return runProfileQuery(this.search, query, feed);
  }

  terminate(): void {
    this.stop();
    this.bytes = undefined;
  }

  /**
   * Build `count` workers and load the feed into every one of them.
   *
   * They load at once, because they are separate workers on separate cores and each spends its
   * time parsing the same bytes. Those bytes are copied into each worker rather than handed over,
   * so the same buffer serves all of them and is still there for the next rebuild.
   */
  private async open(
    count: number,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<ClientFeed> {
    const bytes = this.bytes;
    if (!bytes) throw new Error('No feed has been loaded yet');

    const clients = Array.from(
      { length: count },
      () =>
        new PlannerClient(
          new Worker(new URL('./raptor.worker.ts', import.meta.url), { type: 'module' }),
        ),
    );
    const progress: (LoadProgress | null)[] = clients.map(() => null);

    try {
      // No date is given, so the timetable covers the whole period the feed does and any date in it
      // can be planned without loading again. It costs about 100MB per worker over a single day.
      const loaded = await Promise.all(
        clients.map((client, i) =>
          client.load(bytes, {
            onProgress: (p) => {
              progress[i] = {
                phase: p.phase,
                bytesRead: p.bytesRead,
                bytesTotal: p.bytesTotal,
                entry: p.entry,
                rows: p.rows,
              };
              const slowest = furthestBehind(progress);
              if (slowest) onProgress?.(slowest);
            },
          }),
        ),
      );

      this.clients = clients;
      this.pool = new ParallelDepartAfterQuery(clients.map(asAsyncPlanner));
      this.count = count;

      const first = loaded[0];
      if (!first) throw new Error('A planner needs at least one thread');
      return first;
    } catch (e) {
      for (const client of clients) client.terminate();
      throw e;
    }
  }

  /** Stop the workers. Whatever they were asked is rejected by the client rather than left hanging. */
  private stop(): void {
    for (const client of this.clients) client.terminate();
    this.clients = [];
    this.pool = undefined;
  }

  private readonly search = async (
    origins: string[],
    destinations: string[],
    date: Date,
    seconds: number,
  ): Promise<PlainJourney[]> => {
    const pool = this.pool;
    if (!pool) throw new Error('No feed has been loaded yet');
    return (await pool.planGroup(
      origins,
      destinations,
      date,
      seconds,
    )) as unknown as PlainJourney[];
  };
}

/**
 * A client as the pool wants it.
 *
 * AsyncPlanner is declared over the package's own Journey, but a PlannerClient answers with the
 * journeys a worker can post back, whose trips have lost the Service they cannot carry across the
 * boundary. The pool only decides which client to ask and, with no filters, never looks inside an
 * answer, so the difference is invisible to it — but it is a difference the types do not allow,
 * hence the cast here and the one undoing it as the answer comes back.
 */
const asAsyncPlanner = (client: PlannerClient): AsyncPlanner => client as unknown as AsyncPlanner;

const PHASES = ['downloading', 'reading', 'building'];

/**
 * The load as the least advanced worker sees it.
 *
 * They are all reading the same bytes, so any one of them describes the work; taking the one that
 * has got least far is what makes the bar arrive when the last worker does rather than the first.
 */
function furthestBehind(progress: readonly (LoadProgress | null)[]): LoadProgress | null {
  let slowest: LoadProgress | null = null;

  for (const p of progress) {
    if (!p) continue;
    if (!slowest) {
      slowest = p;
      continue;
    }
    const phase = PHASES.indexOf(p.phase) - PHASES.indexOf(slowest.phase);
    if (phase < 0 || (phase === 0 && p.bytesRead < slowest.bytesRead)) slowest = p;
  }

  return slowest;
}
