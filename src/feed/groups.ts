import type { AreaIndex } from '@gb-transit/gtfs-loader';
import { titleCase } from './buildIndex';
import type { GroupIndex, StationCode, StationGroup, StopId, StopRef } from './types';

/**
 * Turn the feed's areas into the groups a query can be asked in.
 *
 * An area names stops and a query is planned between stations, so each stop is resolved to the
 * station it belongs to and repeats collapse — the several platforms of one station are one member,
 * not several.
 *
 * An area left holding a single station is dropped. Most of the feed's are: 600 of its 729 areas
 * are one station, which as a place to plan from is the station under a second name. What remains
 * is what a group is for — the terminals of a city, the stations of a travelcard zone — and the
 * feed does not say which of the two an area is, so both are offered.
 */
export function toGroups(areas: AreaIndex, stops: Record<StopId, StopRef>): GroupIndex {
  const groups: GroupIndex = {};

  for (const area of Object.values(areas)) {
    const stations = new Set<StationCode>();
    for (const stop of area.stops) {
      const station = stops[stop]?.station;
      if (station !== undefined) stations.add(station);
    }

    if (stations.size < 2) continue;

    groups[area.id] = {
      code: area.id,
      name: area.name ? titleCase(area.name) : area.id,
      stations: [...stations].sort(),
    } satisfies StationGroup;
  }

  return groups;
}
