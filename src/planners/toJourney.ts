import type { StopTime } from 'raptor-journey-planner';
import { titleCase } from '../feed/buildIndex';
import type { FeedIndex, StationCode, TransferMode, TripMeta } from '../feed/types';
import { packJourney } from '../journey/pack';
import { toMinutes } from '../journey/time';
import type { CallingPoint, Journey, Leg, TrainLeg, TransferLeg } from '../journey/types';

/**
 * A journey as a planner's worker posts it back.
 *
 * Both packages under comparison read the same feed with the same loader and return the same shape,
 * so this is written structurally rather than taken from either of them: a trip, less the Service
 * it carries, which is a class and would arrive with its fields and without its methods.
 */
export interface PlainTrip {
  tripId: string;
  routeId?: string | undefined;
  shortName?: string | undefined;
  headsign?: string | undefined;
  stopTimes: StopTime[];
}

export interface PlainTimetableLeg {
  origin: StationCode;
  destination: StationCode;
  stopTimes: StopTime[];
  trip: PlainTrip;
}

export interface PlainTransfer {
  origin: StationCode;
  destination: StationCode;
  duration: number;
  startTime: number;
  endTime: number;
  /** The feed's own transfer mode, where the package carries it through. */
  mode?: string | undefined;
}

export type PlainLeg = PlainTimetableLeg | PlainTransfer;

export interface PlainJourney {
  legs: PlainLeg[];
  departureTime: number;
  arrivalTime: number;
}

/** A timetable leg carries the trip it was taken on; a transfer is the same shape without one. */
const isTimetableLeg = (leg: PlainLeg): leg is PlainTimetableLeg => 'trip' in leg;

/** Seconds in a day. A GTFS time runs past it rather than wrapping, and so does a journey's. */
const DAY = 86400;

/**
 * Turn a journey as a planner returns it into the one the page draws.
 *
 * A transfer says how long it takes and between which times it is available, but not when it was
 * actually made, so the legs are walked forward from the journey's departure: a transfer starts
 * when whatever came before it finished. That is also what makes a leading transfer work, where
 * the journey departs before the first train does because there is a walk to the station first.
 *
 * The clock kept here counts seconds from the midnight the journey started at, and keeps counting
 * past a day rather than wrapping, so that every duration on the page stays a subtraction. A feed
 * writes an overnight service that way already — 00:30 on the second day of a trip that left at
 * 23:50 is `24:30:00` — but a planner that answers a query by searching one day, then the next,
 * returns each day's legs in that day's own seconds from midnight, and those have to be put back
 * onto one clock here or a journey over midnight comes out shorter than nothing.
 */
export function toJourney(plain: PlainJourney, index: FeedIndex): Journey | null {
  const legs: Leg[] = [];
  // Seconds rather than minutes, so that placing a leg against the clock does not turn on which
  // side of a minute the feed's times happen to fall.
  let clock = plain.departureTime;
  let day = 0;

  plain.legs.forEach((leg, i) => {
    if (isTimetableLeg(leg)) {
      const times = leg.stopTimes;
      const departure = times[0]?.departureTime ?? 0;
      const arrival = times[times.length - 1]?.arrivalTime ?? 0;

      // A leg that would leave before the one in front of it arrived is a later day's, so it moves
      // forward whole days until it no longer is.
      while (departure + day < clock) day += DAY;

      legs.push(trainLeg(leg, index, day));
      clock = arrival + day;
      return;
    }

    const transfer: TransferLeg = {
      mode: transferMode(leg.mode),
      from: leg.origin,
      to: leg.destination,
      dep: toMinutes(clock),
      arr: toMinutes(clock + leg.duration),
      id: `transfer-${i}`,
    };
    legs.push(transfer);
    clock += leg.duration;
  });

  return packJourney(legs);
}

/**
 * Who runs a trip, and under what names.
 *
 * The trip carries its own route and names; the index only has to say what that route is called
 * and who runs it, which is shared between every trip on it.
 */
export function describeTrip(index: FeedIndex, trip: PlainTrip): TripMeta {
  const route = trip.routeId === undefined ? undefined : index.routes[trip.routeId];
  const toc = route?.toc ?? '';

  return {
    toc,
    operator: index.operators[toc] ?? (toc || 'Unknown operator'),
    headcode: trip.shortName ?? '',
    headsign: titleCase(trip.headsign ?? ''),
    route: route?.name ?? '',
  };
}

/** `day` is the seconds to add to the leg's own times to put it on the journey's clock. */
function trainLeg(leg: PlainTimetableLeg, index: FeedIndex, day: number): TrainLeg {
  const times = leg.stopTimes;
  const first = times[0];
  const last = times[times.length - 1];

  // The calls a passenger can use. Everything else on the list is a point the train runs through
  // without stopping, which belongs on the map but not in the calling points.
  const calls = times.filter((time) => time.pickUp || time.dropOff);
  const usable = calls.length >= 2 ? calls : times;

  const points: CallingPoint[] = usable.map((time, i) => ({
    stop: stationOf(index, time),
    arr: i === 0 ? null : toMinutes(time.arrivalTime + day),
    dep: i === usable.length - 1 ? null : toMinutes(time.departureTime + day),
    platform: index.stops[time.stop]?.platform ?? null,
  }));

  const meta = describeTrip(index, leg.trip);

  return {
    mode: 'train',
    trip: leg.trip.tripId,
    from: leg.origin,
    to: leg.destination,
    dep: toMinutes((first?.departureTime ?? 0) + day),
    arr: toMinutes((last?.arrivalTime ?? 0) + day),
    toc: meta.toc || '??',
    operator: meta.operator,
    headcode: meta.headcode,
    headsign: meta.headsign,
    route: meta.route,
    stops: runThrough(index, times),
    points,
  };
}

/**
 * The feed writes a mode as one or more tags, e.g. `TRANSFER|TUBE`, so the first one that names a
 * way of travelling wins and a bare `TRANSFER` falls through to walking. `mode` is a feed
 * extension, so a feed — or a package — that does not carry it leaves every change a walk.
 */
export function transferMode(mode: string | undefined): TransferMode {
  for (const tag of (mode ?? '').toUpperCase().split('|')) {
    if (tag === 'TUBE' || tag === 'METRO' || tag === 'TRAM') return 'tube';
    if (tag === 'BUS') return 'bus';
    if (tag === 'FERRY') return 'ferry';
    if (tag === 'WALK') return 'foot';
  }
  return 'foot';
}

const stationOf = (index: FeedIndex, time: StopTime): StationCode =>
  index.stops[time.stop]?.station ?? time.stop;

/**
 * The stations the train runs through, for drawing its line.
 *
 * Consecutive calls at the same station collapse: a feed that lists a train arriving at one
 * platform and leaving from another would otherwise put two points on the map in one place.
 */
function runThrough(index: FeedIndex, times: readonly StopTime[]): StationCode[] {
  const stops: StationCode[] = [];
  for (const time of times) {
    const station = stationOf(index, time);
    if (station !== stops[stops.length - 1]) stops.push(station);
  }
  return stops;
}
