import { describe, expect, it } from 'vitest';
import type { FeedIndex } from '../feed/types';
import { runProfileQuery, type Search } from './profile';
import type { PlainJourney } from './toJourney';
import type { PlannerQuery } from './types';

const index: FeedIndex = {
  stations: {
    EUS: { code: 'EUS', name: 'London Euston', lat: 51.52, lon: -0.13 },
    KGX: { code: 'KGX', name: 'London Kings Cross', lat: 51.53, lon: -0.12 },
    RDG: { code: 'RDG', name: 'Reading', lat: 51.45, lon: -0.97 },
    BHM: { code: 'BHM', name: 'Birmingham New Street', lat: 52.47, lon: -1.9 },
    PLY: { code: 'PLY', name: 'Plymouth', lat: 50.37, lon: -4.14 },
  },
  codes: ['BHM', 'EUS', 'KGX', 'PLY', 'RDG'],
  stops: {
    EUS: { station: 'EUS', platform: null },
    KGX: { station: 'KGX', platform: null },
    RDG: { station: 'RDG', platform: null },
    BHM: { station: 'BHM', platform: null },
    PLY: { station: 'PLY', platform: null },
  },
  routes: { GW: { toc: 'GW', name: 'Great Western Railway' } },
  operators: { GW: 'GWR' },
};

const query = (over: Partial<PlannerQuery> = {}): PlannerQuery => ({
  origins: ['KGX'],
  destinations: ['PLY'],
  date: new Date('2026-09-08'),
  time: 480,
  via: [],
  avoid: [],
  num: 3,
  maxTransfers: 3,
  ...over,
});

const call = (stop: string, minute: number) => ({
  stop,
  arrivalTime: minute * 60,
  departureTime: minute * 60,
  pickUp: true,
  dropOff: true,
});

/** One train from `origin` to `destination`, departing and arriving at the given minutes. */
const service = (
  origin: string,
  destination: string,
  departure: number,
  arrival: number,
): PlainJourney => ({
  departureTime: departure * 60,
  arrivalTime: arrival * 60,
  legs: [
    {
      origin,
      destination,
      stopTimes: [call(origin, departure), call(destination, arrival)],
      trip: { tripId: `${origin}${destination}${departure}`, routeId: 'GW', stopTimes: [] },
    },
  ],
});

/**
 * A search that answers with the first service leaving after the time asked for, and records what
 * it was asked and how many searches were outstanding at once.
 */
function recording(
  every: number,
  resolve: () => Promise<void> = () => Promise.resolve(),
): {
  search: Search;
  calls: { origins: string[]; destinations: string[]; minute: number }[];
  peak: () => number;
} {
  const calls: { origins: string[]; destinations: string[]; minute: number }[] = [];
  let inFlight = 0;
  let peak = 0;

  const search: Search = async (origins, destinations, _date, seconds) => {
    const minute = seconds / 60;
    calls.push({ origins, destinations, minute });
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      await resolve();
      const departure = Math.ceil(minute / every) * every;
      return [service(origins[0] ?? '', destinations[0] ?? '', departure, departure + 120)];
    } finally {
      inFlight--;
    }
  };

  return { search, calls, peak: () => peak };
}

/** Nothing resolves until the macrotask queue has turned over, so overlap is visible. */
const later = () => new Promise<void>((done) => setTimeout(done, 0));

describe('runProfileQuery', () => {
  it('walks a profile forward one search at a time', async () => {
    const { search, calls, peak } = recording(30, later);

    const run = await runProfileQuery(search, query(), index);

    // Each search has to see the previous answer to know where to look next, so they cannot
    // overlap however many workers the planner has.
    expect(peak()).toBe(1);
    expect(run.queries).toBe(3);
    expect(calls.map((c) => c.minute)).toEqual([480, 481, 511]);
    expect(run.journeys.map((j) => j.dep)).toEqual([480, 510, 540]);
  });

  it('sends the onward searches of a via query together', async () => {
    const { search, calls, peak } = recording(30, later);

    const run = await runProfileQuery(search, query({ via: ['RDG'] }), index);

    // Three journeys as far as Reading, then three onward searches that know their own departure
    // time and so go out at once.
    expect(peak()).toBe(3);
    expect(run.journeys).toHaveLength(3);
    expect(run.queries).toBe(6);
    expect(calls.filter((c) => c.origins[0] === 'RDG')).toHaveLength(3);
  });

  it('puts the whole origin and destination set to the search, in one pass', async () => {
    const { search, calls } = recording(30);

    const run = await runProfileQuery(
      search,
      query({ origins: ['EUS', 'KGX'], destinations: ['PLY', 'BHM'], num: 1 }),
      index,
    );

    // One search over both sets, not one per pairing, which is what the query count reports.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.origins).toEqual(['EUS', 'KGX']);
    expect(calls[0]!.destinations).toEqual(['PLY', 'BHM']);
    expect(run.queries).toBe(1);
    expect(run.journeys).toHaveLength(1);
  });

  it('offers the whole via set on the way in, and the station reached on the way out', async () => {
    const { search, calls } = recording(30);

    await runProfileQuery(search, query({ via: ['RDG', 'BHM'], num: 1 }), index);

    // Into the group, then onward from the one station the first half actually reached: a passenger
    // standing at Reading cannot depart from Birmingham.
    expect(calls[0]!.destinations).toEqual(['RDG', 'BHM']);
    expect(calls[1]!.origins).toEqual(['RDG']);
  });

  it('reports a via journey once when two halves stitch to the same offer', async () => {
    // Two ways into the group reaching Reading a few minutes apart, both catching the same onward
    // train. Kept apart in the first half by their arrival, they are one journey once stitched.
    const search: Search = (origins, destinations) =>
      Promise.resolve(
        origins[0] === 'RDG'
          ? [service('RDG', destinations[0] ?? '', 630, 780)]
          : [service('KGX', 'RDG', 540, 600), service('KGX', 'RDG', 540, 605)],
      );

    const run = await runProfileQuery(search, query({ via: ['RDG'], num: 2 }), index);

    expect(run.journeys).toHaveLength(1);
    expect(run.journeys[0]!.arr).toBe(780);
  });
});
