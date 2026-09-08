import type { AgencyIndex, RouteIndex, Stop } from 'raptor-journey-planner';
import type { FeedIndex, RouteRef, Station, StationCode, StopId, StopRef } from './types';

/**
 * Turn the feed as the planner read it into what the page needs to name things.
 *
 * Everything here comes from the loader: the planner returns its stops, and its routes and agencies
 * arrive when the feed is loaded. Nothing re-reads the zip.
 */
export function buildIndex(
  stops: readonly Stop[],
  routeIndex: RouteIndex,
  agencyIndex: AgencyIndex,
): FeedIndex {
  const { stations, stops: stopRefs } = resolveStops(stops);

  const operators: Record<string, string> = {};
  for (const agency of Object.values(agencyIndex)) {
    const toc = tocOf(agency.id);
    operators[toc] = agency.name || toc;
  }

  const routes: Record<string, RouteRef> = {};
  for (const route of Object.values(routeIndex)) {
    routes[route.id] = {
      toc: tocOf(route.agencyId ?? ''),
      name: route.longName || route.shortName || route.id,
    };
  }

  return {
    stations,
    codes: Object.keys(stations).sort((a, b) => stations[a]!.name.localeCompare(stations[b]!.name)),
    stops: stopRefs,
    routes,
    operators,
  };
}

/**
 * `=GW` is how this feed writes an agency id, and the loader hands it back as it found it. The
 * code everyone else uses — and the one the colour palette is keyed on — is `GW`.
 */
const tocOf = (agencyId: string): string => agencyId.replace(/^=/, '');

/**
 * Work out which stops are stations, and which platform of which station every other stop is.
 *
 * A stop reaches its station by following `parentStation` up, however many levels of grouping the
 * feed uses, which is what the planner does when it builds its timetable. The planner knows the
 * answer but does not hand its map across the worker boundary, so it is worked out again here —
 * cheaply, over a few thousand stops rather than a few hundred thousand trips.
 */
function resolveStops(rows: readonly Stop[]): {
  stations: Record<StationCode, Station>;
  stops: Record<StopId, StopRef>;
} {
  const byId = new Map(rows.map((stop) => [stop.id, stop]));
  const stations: Record<StationCode, Station> = {};
  const stops: Record<StopId, StopRef> = {};

  for (const row of rows) {
    let station = row;
    let guard = 0;
    while (station.parentStation && guard++ < 8) {
      const parent = byId.get(station.parentStation);
      if (!parent) break;
      station = parent;
    }

    // A feed need not name a stop, and need not give it a code. Falling back to the id keeps a
    // station findable rather than blank — and an id is left exactly as it is, since it is not a
    // name and quietening it would only mangle it.
    const code = station.code || station.id;
    stations[code] ??= {
      code,
      name: station.name ? titleCase(station.name) : code,
      lat: station.latitude,
      lon: station.longitude,
    };
    stops[row.id] = { station: code, platform: row.platformCode || null };
  }

  return { stations, stops };
}

/**
 * Feeds are inconsistent about case — this one has both `Aberdare` and `ABERAERON ALBAN SQUARE` —
 * so a name that shouts is quietened. A name that does not is left exactly as it is, because
 * anything cleverer gets `GWR` and `St Pancras` wrong.
 */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s(\-/'])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
}
