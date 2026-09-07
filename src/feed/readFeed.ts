import { Unzip, UnzipInflate } from 'fflate';
import { parseCsv } from './csv';
import type {
  FeedIndex,
  FeedInfo,
  Station,
  StationCode,
  StopId,
  StopRef,
  TransferMode,
  TripMeta,
} from './types';

/**
 * The files this reads, and the columns it wants from each.
 *
 * Everything here is something `loadGTFS` either ignores or discards: it never opens agency.txt or
 * routes.txt, and of trips.txt it keeps only the trip and service ids. stop_times.txt is by far
 * the largest file in the feed and is not in this list, so it is skipped without being inflated.
 */
const FILES = {
  'agency.txt': ['agency_id', 'agency_name'],
  'routes.txt': ['route_id', 'agency_id', 'route_short_name', 'route_long_name'],
  'stops.txt': [
    'stop_id',
    'stop_code',
    'stop_name',
    'location_type',
    'parent_station',
    'platform_code',
    'stop_lat',
    'stop_lon',
  ],
  'transfers.txt': ['from_stop_id', 'to_stop_id', 'mode'],
  'trips.txt': ['trip_id', 'route_id', 'trip_short_name', 'trip_headsign'],
  'feed_info.txt': ['feed_start_date', 'feed_end_date', 'feed_version'],
} as const;

/** A trip as it is held: the route it runs on and the two names the feed gives it. */
type TripRow = readonly [route: string, headcode: string, headsign: string];

interface RouteRow {
  toc: string;
  name: string;
}

/** One row of stops.txt, before parents are resolved. */
interface StopRow {
  id: StopId;
  code: string;
  name: string;
  parent: string;
  platform: string;
  lat: number;
  lon: number;
}

/**
 * What the feed knows that the planner does not keep.
 *
 * The trips are the reason this lives in a worker: there are hundreds of thousands of them and
 * only the handful named by a journey on screen is ever wanted, so they stay here and are asked
 * for by id.
 */
export interface FeedMeta {
  index: FeedIndex;
  describe(tripId: string): TripMeta | null;
}

export async function readFeedMeta(bytes: Uint8Array): Promise<FeedMeta> {
  const operators: Record<string, string> = {};
  const routes = new Map<string, RouteRow>();
  const trips = new Map<string, TripRow>();
  const stopRows = new Map<StopId, StopRow>();
  const transferRows: [from: StopId, to: StopId, mode: string][] = [];
  let feedInfo: FeedInfo = {};

  await readEntries(bytes, (name, text) => {
    const columns = FILES[name as keyof typeof FILES];

    switch (name) {
      case 'agency.txt':
        parseCsv(text, columns, ([id, agencyName]) => {
          operators[tocOf(id!)] = agencyName || tocOf(id!);
        });
        break;

      case 'routes.txt':
        parseCsv(text, columns, ([id, agency, short, long]) => {
          routes.set(id!, { toc: tocOf(agency!), name: long || short || id! });
        });
        break;

      case 'stops.txt':
        parseCsv(text, columns, ([id, code, stopName, , parent, platform, lat, lon]) => {
          stopRows.set(id!, {
            id: id!,
            code: code!,
            name: stopName!,
            parent: parent!,
            platform: platform!,
            lat: Number(lat),
            lon: Number(lon),
          });
        });
        break;

      case 'transfers.txt':
        parseCsv(text, columns, ([from, to, mode]) => {
          if (from !== to) transferRows.push([from!, to!, mode!]);
        });
        break;

      case 'trips.txt':
        parseCsv(text, columns, ([id, route, headcode, headsign]) => {
          trips.set(id!, [route!, headcode!, headsign!]);
        });
        break;

      case 'feed_info.txt':
        parseCsv(text, columns, ([start, end, version]) => {
          feedInfo = {
            startDate: start ? Number(start) : undefined,
            endDate: end ? Number(end) : undefined,
            version: version || undefined,
          };
        });
        break;
    }
  });

  const { stations, stops } = resolveStops(stopRows);

  const transfers: Record<string, TransferMode> = {};
  for (const [from, to, mode] of transferRows) {
    const a = stops[from]?.station;
    const b = stops[to]?.station;
    if (a && b && a !== b) transfers[`${a}|${b}`] = transferMode(mode);
  }

  const index: FeedIndex = {
    stations,
    codes: Object.keys(stations).sort((a, b) => stations[a]!.name.localeCompare(stations[b]!.name)),
    stops,
    operators,
    transfers,
    trips: trips.size,
    feedInfo,
  };

  return {
    index,
    describe(tripId) {
      const trip = trips.get(tripId);
      if (!trip) return null;
      const route = routes.get(trip[0]);
      const toc = route?.toc ?? '';
      return {
        toc,
        operator: operators[toc] ?? toc,
        headcode: trip[1],
        headsign: titleCase(trip[2]),
        route: route?.name ?? '',
      };
    },
  };
}

/** `=GW` is how the feed writes an agency id; the code everyone else uses is `GW`. */
const tocOf = (agencyId: string): string => agencyId.replace(/^=/, '');

/**
 * Work out which stops are stations and which platform of which station every other stop is.
 *
 * A stop reaches its station by following `parent_station` up, however many levels of grouping the
 * feed uses, which is what the planner does when it builds the timetable. Doing it in a pass of
 * its own rather than as the rows arrive is what lets a feed list a child before its parent, and
 * this one does.
 */
function resolveStops(rows: Map<StopId, StopRow>): {
  stations: Record<StationCode, Station>;
  stops: Record<StopId, StopRef>;
} {
  const stations: Record<StationCode, Station> = {};
  const stops: Record<StopId, StopRef> = {};

  for (const row of rows.values()) {
    let station = row;
    let guard = 0;
    while (station.parent && guard++ < 8) {
      const parent = rows.get(station.parent);
      if (!parent) break;
      station = parent;
    }

    const code = station.code || station.id;
    stations[code] ??= {
      code,
      name: titleCase(station.name),
      lat: station.lat,
      lon: station.lon,
    };
    stops[row.id] = { station: code, platform: row.platform || null };
  }

  return { stations, stops };
}

/**
 * The feed writes a mode as one or more tags, e.g. `TRANSFER|TUBE`, so the first one that names a
 * way of travelling wins and a bare `TRANSFER` falls through to walking.
 */
function transferMode(mode: string): TransferMode {
  for (const tag of mode.toUpperCase().split('|')) {
    if (tag === 'TUBE' || tag === 'METRO' || tag === 'TRAM') return 'tube';
    if (tag === 'BUS') return 'bus';
    if (tag === 'FERRY') return 'ferry';
    if (tag === 'WALK') return 'foot';
  }
  return 'foot';
}

/**
 * Feeds are inconsistent about case — this one has both `Aberdare` and `ABERAERON ALBAN SQUARE` —
 * so a name that shouts is quietened. A name that does not is left exactly as it is, because
 * anything cleverer gets `GWR` and `St Pancras` wrong.
 */
function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s(\-/'])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
}

/**
 * Pull the wanted files out of a zip without inflating the rest.
 *
 * An entry that is never `start`ed is passed over, which matters: stop_times.txt is 194MB
 * uncompressed and nothing here reads a single row of it.
 */
function readEntries(
  bytes: Uint8Array,
  onFile: (name: string, text: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);

    let outstanding = 0;
    let pushed = false;
    const settle = () => {
      if (pushed && outstanding === 0) resolve();
    };

    unzip.onfile = (file) => {
      const name = basename(file.name);
      if (!(name in FILES)) return;

      outstanding++;
      const chunks: Uint8Array[] = [];
      let size = 0;

      file.ondata = (error, chunk, final) => {
        if (error) return reject(error);
        if (chunk.length > 0) {
          chunks.push(chunk);
          size += chunk.length;
        }
        if (!final) return;

        try {
          onFile(name, decode(chunks, size));
        } catch (e) {
          return reject(e);
        }
        chunks.length = 0;
        outstanding--;
        settle();
      };

      file.start();
    };

    try {
      unzip.push(bytes, true);
    } catch (e) {
      return reject(e);
    }
    pushed = true;
    settle();
  });
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1).toLowerCase();

function decode(chunks: readonly Uint8Array[], size: number): string {
  if (chunks.length === 1) return new TextDecoder().decode(chunks[0]);
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(joined);
}
