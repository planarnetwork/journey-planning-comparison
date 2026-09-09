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
 * after a time, between a set of origins and a set of destinations.
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
  if (query.via.length === 0) {
    return profile(search, feed, query.origins, query.destinations, query.time, query.num, query);
  }

  const first = await profile(search, feed, query.origins, query.via, query.time, query.num, query);

  // The onward searches know their own departure time, so none of them is waiting on another and
  // they all go out at once: a planner with a pool of workers spreads them over it, and one with a
  // single worker queues them as it did when they were asked for one at a time.
  //
  // Each leaves from the station its own half actually reached rather than from the whole via set:
  // where the via is a group, the passenger is standing at one of its stations and the rest are
  // somewhere else entirely.
  const onward = await Promise.all(
    first.journeys.map((leg) => {
      const arrived = leg.legs[leg.legs.length - 1]?.to;
      return arrived === undefined
        ? null
        : profile(search, feed, [arrived], query.destinations, leg.arr, 1, query);
    }),
  );

  const journeys: Journey[] = [];
  let queries = first.queries;

  first.journeys.forEach((leg, i) => {
    const run = onward[i];
    if (!run) return;
    queries += run.queries;
    const next = run.journeys[0];
    if (!next) return;
    const combined = joinJourneys(leg, next);
    // Two halves that reach the same station by different routes catch the same onward train, and
    // stitched they are the same journey twice. That was rare when the via was a single station and
    // is not when it is a group of eighteen.
    if (combined && !seen(journeys, combined)) journeys.push(combined);
  });

  return { journeys, queries };
}

/**
 * Whether a journey is already among these.
 *
 * Departure, arrival and changes, rather than the legs: two journeys that leave and arrive together
 * with the same number of changes are the same offer to a passenger, whichever platforms they used.
 */
const seen = (journeys: readonly Journey[], journey: Journey): boolean =>
  journeys.some(
    (o) => o.dep === journey.dep && o.arr === journey.arr && o.transfers === journey.transfers,
  );

/**
 * Ask for the first journeys after `from`, then again from a minute after the earliest of them,
 * until there are `count` distinct departures or the day runs out.
 */
async function profile(
  search: Search,
  feed: FeedIndex,
  origins: readonly string[],
  destinations: readonly string[],
  from: number,
  count: number,
  query: PlannerQuery,
): Promise<PlannerRun> {
  const journeys: Journey[] = [];
  let time = from;
  let queries = 0;

  // Copied once rather than per round: the packages take arrays they may keep, so a readonly one
  // cannot be handed straight to them.
  const fromStations = [...origins];
  const toStations = [...destinations];

  for (let round = 0; round < count * 3 && journeys.length < count; round++) {
    const plain = await search(fromStations, toStations, query.date, toSeconds(time));
    queries++;

    const found = plain
      .map((journey) => toJourney(journey, feed))
      .filter((journey): journey is Journey => journey !== null);
    if (found.length === 0) break;

    for (const journey of found) {
      if (!allowed(journey, query)) continue;
      if (!seen(journeys, journey)) journeys.push(journey);
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
