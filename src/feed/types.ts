/** A three-letter CRS station code, e.g. `KGX`. This is what journeys are planned between. */
export type StationCode = string;

/** A GTFS `stop_id`, e.g. `9100PADTON2`. This is what a trip's stop times name. */
export type StopId = string;

/** A GTFS `area_id`, e.g. `1072`. In this feed a group station's is its NLC. */
export type GroupCode = string;

/**
 * Either kind of place a query can name: a station, or a group of them.
 *
 * The two are told apart by which index the code is in, and a query names places while a planner
 * plans between stations, so a place is expanded to its stations on the way into the search.
 */
export type PlaceCode = StationCode | GroupCode;

/** How a change between two stations is made, from the feed's own transfer mode. */
export type TransferMode = 'foot' | 'tube' | 'bus' | 'ferry';

export interface Station {
  code: StationCode;
  name: string;
  lat: number;
  lon: number;
}

/**
 * A set of stations the feed names as one place — London Terminals, Glasgow Cen/QSt, a travelcard
 * zone.
 *
 * These arrive as Fares v2 areas because GTFS has no station of stations: `parent_station` is
 * forbidden on a station and the hierarchy is one level deep, so London Terminals cannot be a
 * station holding Euston and Waterloo. `transfers.txt` would be the wrong tool as well, since it
 * asserts a passenger can get between the two stops, which those two are not.
 */
export interface StationGroup {
  code: GroupCode;
  name: string;
  /** The stations of the group. A query naming it departs from, or arrives at, every one of them. */
  stations: StationCode[];
}

export type GroupIndex = Record<GroupCode, StationGroup>;

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
