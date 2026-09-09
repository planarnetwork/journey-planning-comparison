import { createContext, useContext } from 'react';
import type { FeedIndex, GroupIndex, PlaceCode, Station, StationCode, StationGroup } from './types';

/** Naming and finding the places the feed plans between. */
export interface Stations {
  /** Places matching an autocomplete term, best name match first. Stations and groups together. */
  match(query: string, limit?: number): PlaceCode[];
  /** The single best match, for turning typed text into a code. */
  first(query: string): PlaceCode | undefined;
  /** `London Kings Cross (KGX)`, or `London Terminals (1072)`. */
  label(code: PlaceCode): string;
  name(code: PlaceCode): string;
  /** How a place reads in a one-line summary: a station's code, a group's name. */
  short(code: PlaceCode): string;
  /** Whether the feed knows this code, as a station or as a group. */
  has(code: PlaceCode): boolean;
  at(code: PlaceCode): Station | undefined;
  group(code: PlaceCode): StationGroup | undefined;
  /**
   * The stations these places stand for, which is what a planner is actually asked about.
   *
   * A group becomes its members and a station stands for itself, in the order they were given and
   * without repeats — two groups that share a station ask about it once.
   */
  expand(codes: readonly PlaceCode[]): StationCode[];
  readonly codes: readonly StationCode[];
}

export function createStations(index: FeedIndex, groups: GroupIndex = {}): Stations {
  const { stations, codes } = index;

  // A station first and then a group, everywhere, so that a code in both indexes — which nothing
  // in GTFS forbids — reads as the same place whichever of these is asked.
  const name = (code: PlaceCode): string => stations[code]?.name ?? groups[code]?.name ?? code;

  // Stations and groups are searched as one list, so that typing `london t` can reach London
  // Terminals as readily as it reaches a station. Built once, since the feed does not change, and
  // with the lowercase forms the matching wants: they were being made again for every place on
  // every keystroke, three thousand of them, and twice over inside a sort comparator.
  const places: PlaceCode[] = [...codes, ...Object.keys(groups)].sort((a, b) =>
    name(a).localeCompare(name(b)),
  );
  const lower = new Map<PlaceCode, { code: string; name: string }>(
    places.map((code) => [code, { code: code.toLowerCase(), name: name(code).toLowerCase() }]),
  );

  const match = (query: string, limit = 40): PlaceCode[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return places
      .filter((code) => {
        const at = lower.get(code)!;
        return at.code.startsWith(q) || at.name.includes(q);
      })
      .sort((a, b) => {
        const nameA = lower.get(a)!.name;
        const nameB = lower.get(b)!.name;
        return nameA.indexOf(q) - nameB.indexOf(q) || nameA.length - nameB.length;
      })
      .slice(0, limit);
  };

  const expand = (asked: readonly PlaceCode[]): StationCode[] => {
    const out = new Set<StationCode>();
    for (const code of asked) {
      const group = groups[code];
      if (group) for (const station of group.stations) out.add(station);
      else out.add(code);
    }
    return [...out];
  };

  return {
    match,
    first: (query) => match(query, 1)[0],
    label: (code) => `${name(code)} (${code})`,
    name,
    short: (code) => (stations[code] ? code : (groups[code]?.name ?? code)),
    has: (code) => stations[code] !== undefined || groups[code] !== undefined,
    at: (code) => stations[code],
    group: (code) => groups[code],
    expand,
    codes,
  };
}

const StationsContext = createContext<Stations | null>(null);

export const StationsProvider = StationsContext.Provider;

/** Only ever rendered under a loaded feed, so an absent index is a wiring mistake. */
export function useStations(): Stations {
  const stations = useContext(StationsContext);
  if (!stations) throw new Error('useStations was called outside a loaded feed');
  return stations;
}
