import type { PlainJourney } from './toJourney';
import type { LoadProgress } from './types';

/**
 * Where a planner's patterns come from.
 *
 * The whole file in one go, or a station at a time from a directory of them. That choice is the
 * only difference between the two transfer-pattern planners under comparison, and it is made here
 * because it is the worker that does the fetching.
 */
export type PatternSource =
  | { kind: 'eager'; url: string }
  | { kind: 'lazy'; base: string; extension: string };

export type TransferPatternRequest =
  | { id: number; type: 'load'; bytes: ArrayBuffer; patterns: PatternSource }
  | {
      id: number;
      type: 'plan';
      origins: string[];
      destinations: string[];
      date: number;
      time: number;
    };

/**
 * A request before the client gives it an id. Omit has to be spread over the members of the union
 * by hand, since applied to the union as a whole it would keep only the keys they all share.
 */
export type TransferPatternCommand = TransferPatternRequest extends infer R
  ? R extends TransferPatternRequest
    ? Omit<R, 'id'>
    : never
  : never;

export type TransferPatternResponse =
  | { id: number; type: 'loaded'; stops: number; trips: number }
  | { id: number; type: 'planned'; journeys: PlainJourney[] }
  | { id: number; type: 'error'; message: string };

/** Sent while a request is being handled rather than in answer to it, so it carries no id. */
export type TransferPatternEvent = { type: 'progress'; progress: LoadProgress };

export type TransferPatternMessage = TransferPatternResponse | TransferPatternEvent;

export const isEvent = (message: TransferPatternMessage): message is TransferPatternEvent =>
  !('id' in message);
