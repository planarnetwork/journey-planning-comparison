import { createContext, useContext } from 'react';
import type { FeedIndex, Station, StationCode } from './types';

/** Naming and finding the places the feed plans between. */
export interface Stations {
  /** Codes matching an autocomplete term, best name match first. */
  match(query: string, limit?: number): StationCode[];
  /** The single best match, for turning typed text into a code. */
  first(query: string): StationCode | undefined;
  /** `London Kings Cross (KGX)`. */
  label(code: StationCode): string;
  name(code: StationCode): string;
  at(code: StationCode): Station | undefined;
  readonly codes: readonly StationCode[];
}

export function createStations(index: FeedIndex): Stations {
  const { stations, codes } = index;

  const match = (query: string, limit = 40): StationCode[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return codes
      .filter(
        (code) =>
          code.toLowerCase().startsWith(q) || stations[code]!.name.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const nameA = stations[a]!.name.toLowerCase();
        const nameB = stations[b]!.name.toLowerCase();
        return nameA.indexOf(q) - nameB.indexOf(q) || nameA.length - nameB.length;
      })
      .slice(0, limit);
  };

  return {
    match,
    first: (query) => match(query, 1)[0],
    label: (code) => `${stations[code]?.name ?? code} (${code})`,
    name: (code) => stations[code]?.name ?? code,
    at: (code) => stations[code],
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
