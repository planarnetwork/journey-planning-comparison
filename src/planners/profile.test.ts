import { describe, expect, it } from 'vitest';
import type { FeedIndex } from '../feed/types';
import { runProfileQuery, type Search } from './profile';
import type { PlainJourney } from './toJourney';
import type { PlannerQuery } from './types';

const index: FeedIndex = {
  stations: {
    KGX: { code: 'KGX', name: 'London Kings Cross', lat: 51.53, lon: -0.12 },
    RDG: { code: 'RDG', name: 'Reading', lat: 51.45, lon: -0.97 },
    PLY: { code: 'PLY', name: 'Plymouth', lat: 50.37, lon: -4.14 },
  },
  codes: ['KGX', 'PLY', 'RDG'],
  stops: {
    KGX: { station: 'KGX', platform: null },
    RDG: { station: 'RDG', platform: null },
    PLY: { station: 'PLY', platform: null },
  },
  routes: { GW: { toc: 'GW', name: 'Great Western Railway' } },
  operators: { GW: 'GWR' },
};

const query: PlannerQuery = {
  origin: 'KGX',
  dest: 'PLY',
  date: new Date('2026-09-08'),
  time: 480,
  via: null,
  avoid: [],
  num: 3,
  maxTransfers: 3,
};

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
      stopTimes: [
        {
          stop: origin,
          arrivalTime: departure * 60,
          departureTime: departure * 60,
          pickUp: true,
          dropOff: true,
        },
        {
          stop: destination,
          arrivalTime: arrival * 60,
          departureTime: arrival * 60,
          pickUp: true,
          dropOff: true,
        },
      ],
      trip: { tripId: `${origin}${destination}${departure}`, routeId: 'GW', stopTimes: [] },
    },
  ],
});

/**
 * A search that answers with the first service leaving after the time asked for, and records how
 * many searches were outstanding at once.
 */
function recording(
  every: number,
  resolve: () => Promise<void> = () => Promise.resolve(),
): {
  search: Search;
  calls: { origin: string; minute: number }[];
  peak: () => number;
} {
  const calls: { origin: string; minute: number }[] = [];
  let inFlight = 0;
  let peak = 0;

  const search: Search = async (origins, destinations, _date, seconds) => {
    const minute = seconds / 60;
    calls.push({ origin: origins[0] ?? '', minute });
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

/** Nothing resolves until the microtask queue has drained, so overlap is visible. */
const later = () => new Promise<void>((done) => setTimeout(done, 0));

describe('runProfileQuery', () => {
  it('walks a profile forward one search at a time', async () => {
    const { search, calls, peak } = recording(30, later);

    const run = await runProfileQuery(search, query, index);

    // Each search has to see the previous answer to know where to look next, so they cannot
    // overlap however many workers the planner has.
    expect(peak()).toBe(1);
    expect(run.queries).toBe(3);
    expect(calls.map((c) => c.minute)).toEqual([480, 481, 511]);
    expect(run.journeys.map((j) => j.dep)).toEqual([480, 510, 540]);
  });

  it('sends the onward searches of a via query together', async () => {
    const { search, calls, peak } = recording(30, later);

    const run = await runProfileQuery(search, { ...query, via: 'RDG' }, index);

    // Three journeys as far as Reading, then three onward searches that know their own departure
    // time and so go out at once.
    expect(peak()).toBe(3);
    expect(run.journeys).toHaveLength(3);
    expect(run.queries).toBe(6);
    expect(calls.filter((c) => c.origin === 'RDG')).toHaveLength(3);
  });
});
