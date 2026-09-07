/** A three-letter CRS station code, e.g. `KGX`. This is what journeys are planned between. */
export type StationCode = string;

/** A GTFS `stop_id`, e.g. `9100PADTON2`. This is what a trip's stop times name. */
export type StopId = string;

/** How a change between two stations is made, from the feed's own transfer mode. */
export type TransferMode = 'foot' | 'tube' | 'bus' | 'ferry';

export interface Station {
  code: StationCode;
  name: string;
  lat: number;
  lon: number;
}

/** Where a platform-level stop sits: the station it belongs to, and its platform if the feed says. */
export interface StopRef {
  station: StationCode;
  platform: string | null;
}

/**
 * What the planner drops on the floor.
 *
 * `loadGTFS` reads only `trip_id` and `service_id` from trips.txt and does not open routes.txt or
 * agency.txt at all, so a journey comes back knowing which trip it is on and nothing about who
 * runs it. These are read from the same bytes to put that back.
 */
export interface TripMeta {
  /** Two-letter operator code, e.g. `GW`. */
  toc: string;
  /** The operator's name, e.g. `GWR`. */
  operator: string;
  /** `trip_short_name`, which for a UK rail feed is the headcode. */
  headcode: string;
  headsign: string;
  route: string;
}

/** The period a feed covers. Planning outside it throws rather than quietly finding nothing. */
export interface FeedInfo {
  startDate?: number | undefined;
  endDate?: number | undefined;
  version?: string | undefined;
}

/**
 * Everything about the feed the page itself needs: enough to name a station, put it on a map, and
 * say how a change is made. The trips are far too many to send, so they stay in the worker.
 */
export interface FeedIndex {
  stations: Record<StationCode, Station>;
  /** Station codes, sorted by name, for autocomplete. */
  codes: StationCode[];
  stops: Record<StopId, StopRef>;
  /** Operator code to operator name. */
  operators: Record<string, string>;
  /** `${from}|${to}` station codes to how that change is made. */
  transfers: Record<string, TransferMode>;
  trips: number;
  feedInfo: FeedInfo;
}

export type MetaRequest =
  | { id: number; type: 'load'; bytes: ArrayBuffer }
  | { id: number; type: 'trips'; ids: readonly string[] };

/**
 * A request before the client gives it an id. Omit has to be spread over the members of the union
 * by hand, since applied to the union as a whole it would keep only the keys they all share.
 */
export type MetaCommand = MetaRequest extends infer R
  ? R extends MetaRequest
    ? Omit<R, 'id'>
    : never
  : never;

export type MetaResponse =
  | { id: number; type: 'loaded'; index: FeedIndex }
  | { id: number; type: 'trips'; meta: (TripMeta | null)[] }
  | { id: number; type: 'error'; message: string };
