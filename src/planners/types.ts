import type { FeedIndex, StationCode } from '../feed/types';
import type { Journey } from '../journey/types';

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
  /** The feed as this planner read it, for naming places and operators. */
  index: FeedIndex;
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

  /**
   * Take the feed's bytes and build whatever this planner scans, describing what it read.
   *
   * The bytes are passed rather than a url so that a comparison of several planners downloads the
   * feed once and posts a copy to each.
   */
  load(bytes: ArrayBuffer, onProgress?: (progress: LoadProgress) => void): Promise<LoadedFeed>;

  plan(query: PlannerQuery, feed: FeedIndex): Promise<PlannerRun>;

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
