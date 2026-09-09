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


/**
 * A question put to every planner.
 *
 * The places are sets because both packages plan between sets: a query may name several stations,
 * or a group of them like London Terminals, and that is one pass of the search over all of them
 * rather than one pass each. Whatever a group stood for has been expanded by the time a query gets
 * here — a planner is asked about stations, and knows nothing of groups.
 */
export interface PlannerQuery {
  origins: readonly StationCode[];
  destinations: readonly StationCode[];
  date: Date;
  /** Earliest departure, minutes past midnight. */
  time: number;
  /** Stations a journey must call at, any one of which will do. Empty where there is no via. */
  via: readonly StationCode[];
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
   * Take the feed's bytes and build whatever this planner scans.
   *
   * The bytes are passed rather than a url so that a comparison of several planners downloads the
   * feed once and posts a copy to each. Nothing comes back: describing the feed is the page's own
   * reading of it, and what a planner holds to plan with is its own business.
   */
  load(bytes: ArrayBuffer, onProgress?: (progress: LoadProgress) => void): Promise<void>;

  plan(query: PlannerQuery, feed: FeedIndex): Promise<PlannerRun>;

  terminate(): void;
}

/**
 * A planner that can be given more than one worker to scan on.
 *
 * Not every planner can: a pool spreads several searches, so it is worth having where an answer is
 * several independent searches and worth nothing where it is one. Declared apart from Planner so
 * the workbench offers the control to whoever has it rather than to everyone.
 */
export interface Threaded {
  /** Workers this planner is scanning on now. */
  readonly threads: number;

  /**
   * Rebuild on `count` workers, reporting progress as the feed is read into each of them.
   *
   * This costs what the first load did — a worker holds its own timetable and has to build it —
   * so it is a deliberate act, not something to do between queries.
   */
  setThreads(count: number, onProgress?: (progress: LoadProgress) => void): Promise<void>;
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
