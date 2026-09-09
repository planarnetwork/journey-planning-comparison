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
 * What resolving typed text into places needs of the feed.
 *
 * Structural rather than the whole of `Stations`, so this stays testable without one and says
 * exactly what it uses.
 */
export interface PlaceLookup {
  /** The best match for an autocomplete term. */
  first(query: string): string | undefined;
  /** Whether this is a code the feed knows, as a station or as a group. */
  has(code: string): boolean;
  /** The stations these places stand for. */
  expand(codes: readonly string[]): string[];
}

/**
 * Pull a place code out of `Name (CODE)`, falling back to a name lookup.
 *
 * Whatever is in the brackets is taken as a code only if the feed has one by that name — a station
 * by its CRS, a group by its area id. GTFS lets an `area_id` be any text at all, so matching on the
 * shape of one would tie this to a feed whose ids happen to be four characters, and a group the
 * user had just picked from the list would quietly stop resolving.
 */
export function toCode(value: string, places: PlaceLookup): string | null {
  const trimmed = value.trim();
  const match = /\(([^)]+)\)$/.exec(trimmed);
  if (match?.[1] && places.has(match[1])) return match[1];

  return places.first(trimmed) ?? null;
}

/** The same, for a field that takes a comma-separated list of places. */
export function toCodes(value: string, places: PlaceLookup): string[] {
  return splitPlaces(value)
    .map((part) => toCode(part, places))
    .filter((code): code is string => code !== null);
}

/**
 * Split a list of places on its commas, ignoring any inside brackets.
 *
 * The brackets hold a code, and GTFS lets an `area_id` be any text — a comma included — so a
 * comma there is part of the place rather than the end of it.
 *
 * A comma in the *name* is a different matter and is not handled, because it cannot be: `A, B (X)`
 * is either one place called `A, B` or two, and nothing in the text says which. Splitting on every
 * comma at least keeps the common case right, which is the list the autocomplete writes.
 */
export function splitPlaces(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    if (character === '(') depth++;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));

  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The stations a query runs between, and why it cannot run where it cannot. */
export interface JourneyEnds {
  origins: string[];
  destinations: string[];
  /** Set when there is nothing to plan, saying which way it went wrong. */
  problem?: string;
}

/**
 * Work out the two ends of a query from the places that were named.
 *
 * A station on both sides is a journey of no distance, and would beat every real one, so an overlap
 * is dropped — from whichever side has more places to spare. That is what lets a group be planned
 * against one of its own members either way round: London Terminals to Euston departs from the
 * other seventeen, and Euston to London Terminals arrives at them. Only where dropping empties a
 * side is there nothing to ask.
 */
export function journeyEnds(
  from: readonly string[],
  to: readonly string[],
  places: PlaceLookup,
): JourneyEnds {
  let origins = places.expand(from);
  let destinations = places.expand(to);

  if (origins.length === 0 || destinations.length === 0) {
    return { origins, destinations, problem: 'name an origin and a destination' };
  }

  const shared = new Set(origins.filter((code) => destinations.includes(code)));
  if (shared.size > 0) {
    if (origins.length > destinations.length) {
      origins = origins.filter((code) => !shared.has(code));
    } else {
      destinations = destinations.filter((code) => !shared.has(code));
    }
  }

  return origins.length === 0 || destinations.length === 0
    ? { origins, destinations, problem: 'origin and destination are the same place' }
    : { origins, destinations };
}
