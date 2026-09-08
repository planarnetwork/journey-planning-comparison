import type { FeedIndex } from '../feed/types';
import { joinJourneys } from '../journey/pack';
import { toSeconds } from '../journey/time';
import { isTrainLeg, type Journey } from '../journey/types';
import { type PlainJourney, toJourney } from './toJourney';
import type { PlannerQuery, PlannerRun } from './types';

/** Give up rather than search more than this far past the requested departure. */
const HORIZON_MINUTES = 720;

/**
 * One earliest-arrival search, as every planner here happens to offer: the first journeys departing
 * after a time.
 */
export type Search = (
  origins: string[],
  destinations: string[],
  date: Date,
  seconds: number,
) => Promise<PlainJourney[]>;

/**
 * Turn a depart-after search into an answer to the workbench's query.
 *
 * Both packages answer one question — what leaves after this time — so a profile of several
 * departures is that question asked again from just after each answer, and a via query is two
 * profiles stitched together. That is the same for either of them, so it lives here rather than
 * being written twice, and it is why the comparison reports a query count beside the clock.
 */
export async function runProfileQuery(
  search: Search,
  query: PlannerQuery,
  feed: FeedIndex,
): Promise<PlannerRun> {
  if (!query.via) {
    return profile(search, feed, query.origin, query.dest, query.time, query.num, query);
  }

  const first = await profile(search, feed, query.origin, query.via, query.time, query.num, query);
  const journeys: Journey[] = [];
  let queries = first.queries;

  for (const leg of first.journeys) {
    const onward = await profile(search, feed, query.via, query.dest, leg.arr, 1, query);
    queries += onward.queries;
    const next = onward.journeys[0];
    if (!next) continue;
    const combined = joinJourneys(leg, next);
    if (combined) journeys.push(combined);
  }

  return { journeys, queries };
}

/**
 * Ask for the first journeys after `from`, then again from a minute after the earliest of them,
 * until there are `count` distinct departures or the day runs out.
 */
async function profile(
  search: Search,
  feed: FeedIndex,
  origin: string,
  dest: string,
  from: number,
  count: number,
  query: PlannerQuery,
): Promise<PlannerRun> {
  const journeys: Journey[] = [];
  let time = from;
  let queries = 0;

  for (let round = 0; round < count * 3 && journeys.length < count; round++) {
    const plain = await search([origin], [dest], query.date, toSeconds(time));
    queries++;

    const found = plain
      .map((journey) => toJourney(journey, feed))
      .filter((journey): journey is Journey => journey !== null);
    if (found.length === 0) break;

    for (const journey of found) {
      if (!allowed(journey, query)) continue;
      const duplicate = journeys.some(
        (o) => o.dep === journey.dep && o.arr === journey.arr && o.transfers === journey.transfers,
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

/**
 * The constraints neither package takes.
 *
 * Neither has a notion of a station to keep away from, and both count changes differently — a
 * footpath is a leg to them — so both are applied to what comes back rather than to the search.
 */
function allowed(journey: Journey, query: PlannerQuery): boolean {
  if (journey.transfers > query.maxTransfers) return false;

  return !query.avoid.some((code) =>
    journey.legs.some((leg) =>
      isTrainLeg(leg) ? leg.stops.includes(code) : leg.from === code || leg.to === code,
    ),
  );
}
