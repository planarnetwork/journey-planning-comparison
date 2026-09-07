import type { FeedReader } from '../feed/FeedReader';
import type { FeedIndex, StationCode } from '../feed/types';
import type { Journey } from '../journey/types';

/** What a planner is given once, so it can name the places and operators it plans between. */
export interface FeedContext {
  index: FeedIndex;
  reader: FeedReader;
}

export interface LoadProgress {
  phase: 'downloading' | 'reading' | 'building';
  bytesRead: number;
  bytesTotal?: number | undefined;
  /** The file being read, once the planner is past the download. */
  entry?: string | undefined;
  rows: number;
}

export interface LoadedFeed {
  /** Stations the planner will plan between. */
  stops: number;
  trips: number;
}

export interface PlannerQuery {
  origin: StationCode;
  dest: StationCode;
  date: Date;
  /** Earliest departure, minutes past midnight. */
  time: number;
  via: StationCode | null;
  avoid: readonly StationCode[];
  /** Number of distinct departures wanted. */
  num: number;
  maxTransfers: number;
}

export interface PlannerRun {
  journeys: Journey[];
  /** Searches run to build the profile — one planner may need several where another needs one. */
  queries: number;
}

/**
 * One journey planner under comparison.
 *
 * Each owns its worker and its copy of the timetable, because the packages being compared have no
 * common representation and turning one's into another's would be comparing the conversion.
 */
export interface Planner {
  readonly id: string;
  readonly name: string;
  /** One line under the name, saying what the algorithm is. */
  readonly sub: string;
  /** The npm package it comes from. */
  readonly pkg: string;
  readonly version: string;
  /** OKLCH hue used for this planner's accents. */
  readonly hue: number;

  load(
    bytes: ArrayBuffer,
    context: FeedContext,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<LoadedFeed>;

  plan(query: PlannerQuery): Promise<PlannerRun>;

  terminate(): void;
}

/** A planner's answer to one comparison, with the wall clock it took. */
export interface PlannerResult {
  planner: Planner;
  ms: number;
  journeys: Journey[];
  queries: number;
  /** Set when the planner refused the query — an out-of-range date, say. */
  error?: string;
}
