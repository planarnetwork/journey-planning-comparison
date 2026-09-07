import type { Journey, Leg } from './types';
import { isTrainLeg } from './types';

/** Wrap legs into a journey. Returns null for an empty path or one with no train in it. */
export function packJourney(legs: readonly Leg[]): Journey | null {
  if (legs.length === 0) return null;
  const trains = legs.filter(isTrainLeg);
  if (trains.length === 0) return null;

  const first = legs[0]!;
  const last = legs[legs.length - 1]!;
  return {
    legs,
    dep: first.dep,
    arr: last.arr,
    transfers: trains.length - 1,
    duration: last.arr - first.dep,
    tocs: [...new Set(trains.map((leg) => leg.toc))],
    footLegs: legs.length - trains.length,
  };
}

/**
 * Concatenate the two halves of a via query, renumbering transfer ids so they stay unique across
 * the combined leg list.
 */
export function joinJourneys(first: Journey, second: Journey): Journey | null {
  const legs = [...first.legs, ...second.legs].map((leg, i) =>
    isTrainLeg(leg) ? leg : { ...leg, id: `${leg.mode}-${i}` },
  );
  return packJourney(legs);
}
