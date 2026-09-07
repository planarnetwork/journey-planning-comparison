import type { FeedIndex } from '../feed/types';
import { fromDateNumber } from '../journey/time';
import type { Planner } from '../planners/types';

export interface QueryState {
  origin: string;
  dest: string;
  date: string;
  time: string;
  via: string;
  avoid: string;
  num: number;
  maxTransfers: number;
  planners: string[];
}

export interface QuerySeed {
  index: FeedIndex;
  planners: readonly Planner[];
}

/**
 * The query the workbench opens on.
 *
 * The date is the first day the feed covers rather than today's: a feed is published for a window,
 * and planning outside it throws rather than quietly finding nothing.
 */
export function initialQuery({ index, planners }: QuerySeed): QueryState {
  const start = index.feedInfo.startDate;
  return {
    origin: label(index, 'KGX') ?? '',
    dest: label(index, 'PLY') ?? '',
    date: start ? fromDateNumber(start) : new Date().toISOString().slice(0, 10),
    time: '08:00',
    via: '',
    avoid: '',
    num: 4,
    maxTransfers: 3,
    planners: planners.map((planner) => planner.id),
  };
}

const label = (index: FeedIndex, code: string): string | undefined => {
  const station = index.stations[code];
  return station && `${station.name} (${station.code})`;
};

export type QueryAction =
  | { type: 'set'; field: keyof QueryState; value: string | number }
  | { type: 'togglePlanner'; id: string };

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'togglePlanner': {
      const on = state.planners.includes(action.id);
      const planners = on
        ? state.planners.filter((id) => id !== action.id)
        : [...state.planners, action.id];
      // Never leave the comparison with nothing to compare.
      return { ...state, planners: planners.length ? planners : [action.id] };
    }
  }
}

/** Pull a CRS code out of `Name (CRS)`, falling back to a name lookup. */
export function toCode(value: string, resolve: (q: string) => string | undefined): string | null {
  const match = /\(([A-Z0-9]{3})\)$/.exec(value.trim());
  if (match?.[1]) return match[1];
  return resolve(value.trim()) ?? null;
}

export function toCodes(value: string, resolve: (q: string) => string | undefined): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => toCode(part, resolve))
    .filter((code): code is string => code !== null);
}
