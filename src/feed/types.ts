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

/** A route, reduced to the two things a journey wants to say about one. */
export interface RouteRef {
  /** Two-letter operator code, e.g. `GW`. */
  toc: string;
  name: string;
}

/**
 * What a journey needs beyond its times: the names of the places it calls at and of whoever runs
 * the trains.
 *
 * A trip carries its own route and names now, so this holds only what is shared between trips —
 * a few thousand stations and under a hundred routes, rather than a table of every trip in the
 * country.
 */
export interface FeedIndex {
  stations: Record<StationCode, Station>;
  /** Station codes, sorted by name, for autocomplete. */
  codes: StationCode[];
  stops: Record<StopId, StopRef>;
  /** Route id to its operator and name. */
  routes: Record<string, RouteRef>;
  /** Operator code to operator name. */
  operators: Record<string, string>;
}

/** Who runs a train, and under what names. Resolved from a trip and the index it belongs to. */
export interface TripMeta {
  toc: string;
  operator: string;
  /** `trip_short_name`, which for a UK rail feed is the headcode. */
  headcode: string;
  headsign: string;
  route: string;
}
