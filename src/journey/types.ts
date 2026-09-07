import type { StationCode, TransferMode } from '../feed/types';

/**
 * A call a passenger can use, as opposed to a point the train merely passes.
 *
 * Times are minutes past midnight and may run past 1440 on a journey that crosses midnight, so
 * that a duration stays a subtraction.
 */
export interface CallingPoint {
  stop: StationCode;
  /** null at the leg's origin. */
  arr: number | null;
  /** null at the leg's destination. */
  dep: number | null;
  /** From the feed's `platform_code`, where it identifies one. */
  platform: string | null;
}

interface LegBase {
  from: StationCode;
  to: StationCode;
  dep: number;
  arr: number;
}

export interface TrainLeg extends LegBase {
  mode: 'train';
  /** The feed's own `trip_id`. */
  trip: string;
  /** Two-letter operator code, e.g. `GW`. */
  toc: string;
  operator: string;
  headcode: string;
  headsign: string;
  route: string;
  /** Every station the train runs through, passing points included, for drawing the line. */
  stops: readonly StationCode[];
  /** Only the calls a passenger can board or alight at. */
  points: readonly CallingPoint[];
}

export interface TransferLeg extends LegBase {
  mode: TransferMode;
  /** Stable within a journey, for React keys. */
  id: string;
}

export type Leg = TrainLeg | TransferLeg;

export const isTrainLeg = (leg: Leg): leg is TrainLeg => leg.mode === 'train';

export interface Journey {
  legs: readonly Leg[];
  dep: number;
  arr: number;
  /** Train-to-train changes; a journey with one train has zero. */
  transfers: number;
  duration: number;
  tocs: readonly string[];
  /** Number of walking, Tube, bus or ferry legs, including out-of-station interchanges. */
  footLegs: number;
}
