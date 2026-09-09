import { describe, expect, it } from 'vitest';
import { createStations } from './stations';
import type { FeedIndex, GroupIndex } from './types';

const index: FeedIndex = {
  stations: {
    EUS: { code: 'EUS', name: 'London Euston', lat: 51.52, lon: -0.13 },
    KGX: { code: 'KGX', name: 'London Kings Cross', lat: 51.53, lon: -0.12 },
    PAD: { code: 'PAD', name: 'London Paddington', lat: 51.51, lon: -0.17 },
    PLY: { code: 'PLY', name: 'Plymouth', lat: 50.37, lon: -4.14 },
  },
  codes: ['EUS', 'KGX', 'PAD', 'PLY'],
  stops: {},
  routes: {},
  operators: {},
};

const groups: GroupIndex = {
  '1072': { code: '1072', name: 'London Terminals', stations: ['EUS', 'KGX', 'PAD'] },
  '0032': { code: '0032', name: 'London Zones 1-2', stations: ['EUS', 'KGX'] },
};

const stations = createStations(index, groups);

describe('createStations', () => {
  it('offers a group alongside the stations, for the same typing', () => {
    expect(stations.match('london t')).toEqual(['1072']);
    expect(stations.match('london')).toContain('1072');
    expect(stations.match('london')).toContain('KGX');
  });

  it('finds a group by its area id, as it finds a station by its CRS', () => {
    expect(stations.match('1072')).toEqual(['1072']);
    expect(stations.first('KGX')).toBe('KGX');
  });

  it('writes a group into the field the same way a station is written', () => {
    expect(stations.label('1072')).toBe('London Terminals (1072)');
    expect(stations.label('KGX')).toBe('London Kings Cross (KGX)');
  });

  it('turns a group into the stations a planner is asked about', () => {
    expect(stations.expand(['1072'])).toEqual(['EUS', 'KGX', 'PAD']);
  });

  it('leaves a station standing for itself', () => {
    expect(stations.expand(['KGX', 'PLY'])).toEqual(['KGX', 'PLY']);
  });

  it('asks about a station shared by two groups only once', () => {
    expect(stations.expand(['1072', '0032'])).toEqual(['EUS', 'KGX', 'PAD']);
    expect(stations.expand(['1072', 'KGX'])).toEqual(['EUS', 'KGX', 'PAD']);
  });

  it('names a group by name and a station by code, for the summary line', () => {
    expect(stations.short('1072')).toBe('London Terminals');
    expect(stations.short('KGX')).toBe('KGX');
  });

  it('says which places are groups, so the list can tell them apart', () => {
    expect(stations.group('1072')?.stations).toHaveLength(3);
    expect(stations.group('KGX')).toBeUndefined();
  });

  it('has no groups at all for a feed that publishes no areas', () => {
    const bare = createStations(index);

    // Shortest name first, as the match has always been ordered.
    expect(bare.match('london')).toEqual(['EUS', 'PAD', 'KGX']);
    expect(bare.expand(['KGX'])).toEqual(['KGX']);
  });
});
