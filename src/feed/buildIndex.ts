import type { AgencyIndex, RouteIndex, Stop } from '@gb-transit/gtfs-loader';
import type { FeedIndex, RouteRef, Station, StationCode, StopId, StopRef } from './types';

/**
 * Turn the feed into what the page needs to name things.
 *
 * This runs in the page's own reading of the feed, beside the planners' readings of it, so the
 * stops, routes and agencies here are the loader's own rather than whatever a planner chose to hand
 * back. Nothing has to be asked of a journey planner to put a name on a station.
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
