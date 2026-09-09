import type { FeedIndex } from '../feed/types';
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
 * Today, which a current feed covers. The period a feed is published for does not cross the worker
 * boundary, so rather than guess at it, a date outside it is left to the planner, which refuses it
 * and says what it does cover.
 */
export function initialQuery({ index, planners }: QuerySeed): QueryState {
  return {
    origin: label(index, 'KGX') ?? '',
    dest: label(index, 'PLY') ?? '',
    date: new Date().toISOString().slice(0, 10),
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

/**
 * Pull a place code out of `Name (CODE)`, falling back to a name lookup.
 *
 * Three characters is a station's CRS and four is a group's area id, which in this feed is an NLC.
 * The two cannot be confused for one another, so which index the code is in says which it is and
 * nothing here has to.
 */
export function toCode(value: string, resolve: (q: string) => string | undefined): string | null {
  const match = /\(([A-Z0-9]{3,4})\)$/.exec(value.trim());
  if (match?.[1]) return match[1];
  return resolve(value.trim()) ?? null;
}

/** The same, for a field that takes a comma-separated list of places. */
export function toCodes(value: string, resolve: (q: string) => string | undefined): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => toCode(part, resolve))
    .filter((code): code is string => code !== null);
}
