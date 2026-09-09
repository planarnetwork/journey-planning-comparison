import type { AgencyIndex, RouteIndex, Stop } from '@gb-transit/gtfs-loader';
import { describe, expect, it } from 'vitest';
import { buildIndex } from './buildIndex';

const stop = (over: Partial<Stop> & Pick<Stop, 'id'>): Stop => ({
  latitude: 0,
  longitude: 0,
  locationType: 0,
  ...over,
});

/** Platform stops under station parents, listed before them, as the real feed does. */
const STOPS: Stop[] = [
  stop({
    id: '9100PADTON2',
    code: 'PAD',
    name: 'London Paddington Platform 2',
    parentStation: '910GPADTON',
    platformCode: '2',
    latitude: 51.5164,
    longitude: -0.1768,
  }),
  stop({
    id: '9100PLYMTH5',
    code: 'PLY',
    name: 'PLYMOUTH PLATFORM 5',
    parentStation: '910GPLYMTH',
    platformCode: '5',
  }),
  stop({
    id: '910GPADTON',
    code: 'PAD',
    name: 'London Paddington',
    locationType: 1,
    latitude: 51.5164,
    longitude: -0.1768,
  }),
  stop({ id: '910GPLYMTH', code: 'PLY', name: 'PLYMOUTH', locationType: 1 }),
];

const ROUTES: RouteIndex = {
  GW: { id: 'GW', agencyId: '=GW', shortName: 'GWR', longName: 'Great Western Railway', type: 2 },
  XX: { id: 'XX', type: 2 },
};

const AGENCIES: AgencyIndex = {
  '=GW': { id: '=GW', name: 'GWR' },
  '=ZZ': { id: '=ZZ' },
};

describe('buildIndex', () => {
  it('resolves platform stops to the station they belong to', () => {
    const { stops } = buildIndex(STOPS, ROUTES, AGENCIES);

    expect(stops['9100PADTON2']).toEqual({ station: 'PAD', platform: '2' });
    expect(stops['9100PLYMTH5']).toEqual({ station: 'PLY', platform: '5' });
    // The station's own stop resolves to itself, so a trip calling there still has a station.
    expect(stops['910GPADTON']).toEqual({ station: 'PAD', platform: null });
  });

  it('takes a station’s name and position from the parent, not the platform', () => {
    const { stations } = buildIndex(STOPS, ROUTES, AGENCIES);

    expect(stations.PAD).toEqual({
      code: 'PAD',
      name: 'London Paddington',
      lat: 51.5164,
      lon: -0.1768,
    });
  });

  it('quietens a name that shouts and leaves one that does not', () => {
    const { stations } = buildIndex(STOPS, ROUTES, AGENCIES);

    expect(stations.PLY!.name).toBe('Plymouth');
    expect(stations.PAD!.name).toBe('London Paddington');
  });

  it('orders station codes by name, for autocomplete', () => {
    expect(buildIndex(STOPS, ROUTES, AGENCIES).codes).toEqual(['PAD', 'PLY']);
  });

  it('strips the = the feed writes an agency id with', () => {
    const { operators, routes } = buildIndex(STOPS, ROUTES, AGENCIES);

    expect(operators.GW).toBe('GWR');
    expect(routes.GW).toEqual({ toc: 'GW', name: 'Great Western Railway' });
  });

  it('falls back to what it has when a feed leaves fields out', () => {
    const { operators, routes, stations } = buildIndex(
      [stop({ id: '9400ONLYID' })],
      ROUTES,
      AGENCIES,
    );

    // An agency with no name, and a route with no agency and no names.
    expect(operators.ZZ).toBe('ZZ');
    expect(routes.XX).toEqual({ toc: '', name: 'XX' });
    // A stop with no code and no name is still findable under its id.
    expect(stations['9400ONLYID']).toMatchObject({ code: '9400ONLYID', name: '9400ONLYID' });
  });

  it('does not loop on a stop that is its own parent', () => {
    const { stops } = buildIndex(
      [stop({ id: 'LOOP', code: 'LPP', name: 'Loop', parentStation: 'LOOP' })],
      ROUTES,
      AGENCIES,
    );

    expect(stops.LOOP).toEqual({ station: 'LPP', platform: null });
  });
});
