import type { PlainJourney, PlainLeg, StopTime } from 'raptor-journey-planner';
import type { FeedIndex, StationCode, TripMeta } from '../feed/types';
import { packJourney } from '../journey/pack';
import { toMinutes } from '../journey/time';
import type { CallingPoint, Journey, Leg, TrainLeg, TransferLeg } from '../journey/types';

/** A timetable leg carries the trip it was taken on; a transfer is the same shape without one. */
const isTimetableLeg = (leg: PlainLeg): leg is Extract<PlainLeg, { trip: unknown }> =>
  'trip' in leg;

/** Every trip named by these journeys, so their operators can be fetched in one go. */
export const tripIdsOf = (journeys: readonly PlainJourney[]): string[] => [
  ...new Set(journeys.flatMap((j) => j.legs.filter(isTimetableLeg).map((l) => l.trip.tripId))),
];

/**
 * Turn a journey as the planner returns it into the one the page draws.
 *
 * A transfer says how long it takes and between which times it is available, but not when it was
 * actually made, so the legs are walked forward from the journey's departure: a transfer starts
 * when whatever came before it finished. That is also what makes a leading transfer work, where
 * the journey departs before the first train does because there is a walk to the station first.
 */
export function toJourney(
  plain: PlainJourney,
  index: FeedIndex,
  meta: (tripId: string) => TripMeta | null,
): Journey | null {
  const legs: Leg[] = [];
  let clock = toMinutes(plain.departureTime);

  plain.legs.forEach((leg, i) => {
    if (isTimetableLeg(leg)) {
      const train = trainLeg(leg, index, meta);
      legs.push(train);
      clock = train.arr;
      return;
    }

    const transfer: TransferLeg = {
      mode: index.transfers[`${leg.origin}|${leg.destination}`] ?? 'foot',
      from: leg.origin,
      to: leg.destination,
      dep: clock,
      arr: clock + toMinutes(leg.duration),
      id: `transfer-${i}`,
    };
    legs.push(transfer);
    clock = transfer.arr;
  });

  return packJourney(legs);
}

function trainLeg(
  leg: Extract<PlainLeg, { trip: unknown }>,
  index: FeedIndex,
  meta: (tripId: string) => TripMeta | null,
): TrainLeg {
  const times = leg.stopTimes;
  const first = times[0];
  const last = times[times.length - 1];

  // The calls a passenger can use. Everything else on the list is a point the train runs through
  // without stopping, which belongs on the map but not in the calling points.
  const calls = times.filter((time) => time.pickUp || time.dropOff);
  const usable = calls.length >= 2 ? calls : times;

  const points: CallingPoint[] = usable.map((time, i) => ({
    stop: stationOf(index, time),
    arr: i === 0 ? null : toMinutes(time.arrivalTime),
    dep: i === usable.length - 1 ? null : toMinutes(time.departureTime),
    platform: index.stops[time.stop]?.platform ?? null,
  }));

  const trip = meta(leg.trip.tripId);

  return {
    mode: 'train',
    trip: leg.trip.tripId,
    from: leg.origin,
    to: leg.destination,
    dep: toMinutes(first?.departureTime ?? 0),
    arr: toMinutes(last?.arrivalTime ?? 0),
    toc: trip?.toc ?? '??',
    operator: trip?.operator ?? 'Unknown operator',
    headcode: trip?.headcode ?? '',
    headsign: trip?.headsign ?? '',
    route: trip?.route ?? '',
    stops: runThrough(index, times),
    points,
  };
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
