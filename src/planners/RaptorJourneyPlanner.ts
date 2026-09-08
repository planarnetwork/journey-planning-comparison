import { PlannerClient } from 'raptor-journey-planner';
import { version } from 'raptor-journey-planner/package.json';
import { buildIndex } from '../feed/buildIndex';
import type { FeedIndex } from '../feed/types';
import { joinJourneys } from '../journey/pack';
import { toSeconds } from '../journey/time';
import { isTrainLeg, type Journey } from '../journey/types';
import { toJourney } from './toJourney';
import type { LoadedFeed, LoadProgress, Planner, PlannerQuery, PlannerRun } from './types';

/** Give up rather than search more than this far past the requested departure. */
const HORIZON_MINUTES = 720;

/**
 * planarnetwork/raptor, driven through the worker client the package ships.
 *
 * The package answers one question — the first journeys departing after a time — so a profile of
 * several departures is that question asked again from just after each answer, which is why the
 * comparison reports a query count alongside the clock.
 */
export class RaptorJourneyPlanner implements Planner {
  readonly id = 'rjp';
  readonly name = 'RAPTOR';
  readonly sub = 'round-based, depart-after';
  readonly pkg = 'raptor-journey-planner';
  readonly version = version;
  readonly hue = 65;

  private client: PlannerClient | undefined;

  async load(
    bytes: ArrayBuffer,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<LoadedFeed> {
    const worker = new Worker(new URL('./raptor.worker.ts', import.meta.url), { type: 'module' });
    const client = new PlannerClient(worker);
    this.client = client;

    // No date is given, so the timetable covers the whole period the feed does and any date in it
    // can be planned without loading again. It costs about 100MB over a single day.
    const loaded = await client.load(bytes, {
      onProgress: (progress) =>
        onProgress?.({
          phase: progress.phase,
          bytesRead: progress.bytesRead,
          bytesTotal: progress.bytesTotal,
          entry: progress.entry,
          rows: progress.rows,
        }),
    });

    const stops = await client.stops();
    return {
      stops: loaded.stops,
      trips: loaded.trips,
      index: buildIndex(stops, loaded.routes, loaded.agencies),
    };
  }

  async plan(query: PlannerQuery, feed: FeedIndex): Promise<PlannerRun> {
    if (!query.via) {
      return this.profile(query.origin, query.dest, query.time, query.num, query, feed);
    }

    // A via query is two profiles stitched together: find departures to the via point, then the
    // first onward service from each.
    const first = await this.profile(query.origin, query.via, query.time, query.num, query, feed);
    const journeys: Journey[] = [];
    let queries = first.queries;

    for (const leg of first.journeys) {
      const onward = await this.profile(query.via, query.dest, leg.arr, 1, query, feed);
      queries += onward.queries;
      const next = onward.journeys[0];
      if (!next) continue;
      const combined = joinJourneys(leg, next);
      if (combined) journeys.push(combined);
    }

    return { journeys, queries };
  }

  terminate(): void {
    this.client?.terminate();
    this.client = undefined;
  }

  /**
   * Ask for the first journeys after `from`, then again from a minute after the earliest of them,
   * until there are `count` distinct departures or the day runs out.
   */
  private async profile(
    origin: string,
    dest: string,
    from: number,
    count: number,
    query: PlannerQuery,
    feed: FeedIndex,
  ): Promise<PlannerRun> {
    const client = this.client;
    if (!client) throw new Error('No feed has been loaded yet');

    const journeys: Journey[] = [];
    let time = from;
    let queries = 0;

    for (let round = 0; round < count * 3 && journeys.length < count; round++) {
      const plain = await client.plan([origin], [dest], query.date, toSeconds(time));
      queries++;

      const found = plain
        .map((journey) => toJourney(journey, feed))
        .filter((journey): journey is Journey => journey !== null);
      if (found.length === 0) break;

      for (const journey of found) {
        if (!allowed(journey, query)) continue;
        const duplicate = journeys.some(
          (o) =>
            o.dep === journey.dep && o.arr === journey.arr && o.transfers === journey.transfers,
        );
        if (!duplicate) journeys.push(journey);
      }

      // Step past the earliest departure found, whether or not the constraints kept it — a journey
      // filtered out here must not stop the search from reaching the ones after it.
      const next = Math.min(...found.map((j) => j.dep)) + 1;
      if (next <= time) break;
      time = next;
      if (time > from + HORIZON_MINUTES) break;
    }

    journeys.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
    return { journeys: journeys.slice(0, count), queries };
  }
}

/**
 * The constraints the package does not take.
 *
 * It has no notion of a station to keep away from and counts changes differently — a footpath is a
 * leg to it — so both are applied to what comes back rather than to the search.
 */
function allowed(journey: Journey, query: PlannerQuery): boolean {
  if (journey.transfers > query.maxTransfers) return false;

  return !query.avoid.some((code) =>
    journey.legs.some((leg) =>
      isTrainLeg(leg) ? leg.stops.includes(code) : leg.from === code || leg.to === code,
    ),
  );
}
