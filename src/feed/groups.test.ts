import type { AreaIndex } from '@gb-transit/gtfs-loader';
import { describe, expect, it } from 'vitest';
import { toGroups } from './groups';
import type { StopId, StopRef } from './types';

/** Platforms and their stations, as `buildIndex` resolves them. */
const STOPS: Record<StopId, StopRef> = {
  '910GKNGX': { station: 'KGX', platform: null },
  '9100KNGX1': { station: 'KGX', platform: '1' },
  '910GEUSTON': { station: 'EUS', platform: null },
  '910GPADTON': { station: 'PAD', platform: null },
  '910GPLYMTH': { station: 'PLY', platform: null },
};

/** Areas as the loader hands them over: areas.txt and stop_areas.txt already read as one thing. */
const AREAS: AreaIndex = {
  '1072': {
    id: '1072',
    name: 'LONDON TERMINALS',
    // The area names a platform as well as its station, as a real one does.
    stops: ['910GKNGX', '9100KNGX1', '910GEUSTON', '910GPADTON'],
  },
  '0032': { id: '0032', name: 'LONDON ZONES 1-2', stops: ['910GKNGX', '910GEUSTON'] },
  // A group of one station, and one whose only stop the feed does not have.
  '5000': { id: '5000', name: 'PLYMOUTH', stops: ['910GPLYMTH'] },
  '6000': { id: '6000', name: 'NOTHING HERE', stops: ['9100NOWHERE'] },
  '7000': { id: '7000', stops: ['910GKNGX', '910GPADTON'] },
};

describe('toGroups', () => {
  it('collects the stations of a group, quietening a name that shouts', () => {
    const groups = toGroups(AREAS, STOPS);

    expect(groups['1072']).toEqual({
      code: '1072',
      name: 'London Terminals',
      stations: ['EUS', 'KGX', 'PAD'],
    });
  });

  it('counts a station once however many of its platforms the area lists', () => {
    // The area names both London Kings Cross and its platform 1.
    expect(toGroups(AREAS, STOPS)['1072']!.stations).toEqual(['EUS', 'KGX', 'PAD']);
  });

  it('leaves out a group that is one station, or none', () => {
    const groups = toGroups(AREAS, STOPS);

    expect(groups['5000']).toBeUndefined();
    expect(groups['6000']).toBeUndefined();
  });

  it('keeps a station a group shares with another', () => {
    expect(toGroups(AREAS, STOPS)['0032']!.stations).toEqual(['EUS', 'KGX']);
  });

  it('falls back to the id where a feed leaves an area unnamed', () => {
    expect(toGroups(AREAS, STOPS)['7000']!.name).toBe('7000');
  });

  it('has no groups for a feed with no areas', () => {
    expect(toGroups({}, STOPS)).toEqual({});
  });
});
