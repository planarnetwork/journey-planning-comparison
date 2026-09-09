import { describe, expect, it } from 'vitest';
import { journeyEnds, type PlaceLookup, splitPlaces, toCode, toCodes } from './query';

/**
 * Three stations and two groups, one of which holds two of the stations.
 *
 * `HEATHROW+BUS` is given an id nothing could guess the shape of, because GTFS lets an `area_id` be
 * any text and this feed's four-character NLCs are a fact about this feed.
 */
const GROUPS: Record<string, string[]> = {
  '1072': ['EUS', 'KGX'],
  'heathrow-bus': ['EUS', 'PLY'],
};
const STATIONS = ['EUS', 'KGX', 'PLY'];
const NAMES: Record<string, string> = {
  EUS: 'London Euston',
  KGX: 'London Kings Cross',
  PLY: 'Plymouth',
  '1072': 'London Terminals',
  'heathrow-bus': 'Heathrow Bus',
};

const places: PlaceLookup = {
  first: (query) =>
    Object.keys(NAMES).find((code) => NAMES[code]!.toLowerCase() === query.trim().toLowerCase()),
  has: (code) => STATIONS.includes(code) || code in GROUPS,
  expand: (codes) => [...new Set(codes.flatMap((code) => GROUPS[code] ?? [code]))],
};

describe('toCode', () => {
  it('takes the code out of the brackets', () => {
    expect(toCode('London Kings Cross (KGX)', places)).toBe('KGX');
  });

  it('takes a group code out of the brackets, whatever shape it is', () => {
    expect(toCode('London Terminals (1072)', places)).toBe('1072');
    // The id the shape-matching regex would have refused, sending it to a name lookup that could
    // never find `Heathrow Bus (heathrow-bus)`.
    expect(toCode('Heathrow Bus (heathrow-bus)', places)).toBe('heathrow-bus');
  });

  it('falls back to the name when the brackets hold something the feed has never heard of', () => {
    expect(toCode('London Euston (ZZZ)', places)).toBeNull();
    expect(toCode('London Euston', places)).toBe('EUS');
  });

  it('is null for text that names nothing', () => {
    expect(toCode('nowhere at all', places)).toBeNull();
  });
});

describe('splitPlaces', () => {
  it('splits a list on its commas', () => {
    expect(splitPlaces('London Euston (EUS), Plymouth (PLY)')).toEqual([
      'London Euston (EUS)',
      'Plymouth (PLY)',
    ]);
  });

  it('leaves a comma inside the brackets alone', () => {
    // GTFS lets an area_id be any text, so a comma there belongs to the code, not to the list.
    expect(splitPlaces('Heathrow Bus (a,b), Plymouth (PLY)')).toEqual([
      'Heathrow Bus (a,b)',
      'Plymouth (PLY)',
    ]);
  });

  it('splits a comma in a name, which cannot be told from the end of a place', () => {
    // `A, B (X)` is either one place or two and the text does not say. The common case — the list
    // the autocomplete writes — is the one kept right.
    expect(splitPlaces('London, Zone 1 (0032)')).toEqual(['London', 'Zone 1 (0032)']);
  });

  it('drops the empty parts a trailing comma leaves', () => {
    expect(splitPlaces('Plymouth (PLY), ')).toEqual(['Plymouth (PLY)']);
  });
});

describe('toCodes', () => {
  it('resolves every place in the list', () => {
    expect(toCodes('London Euston (EUS), London Terminals (1072)', places)).toEqual([
      'EUS',
      '1072',
    ]);
  });
});

describe('journeyEnds', () => {
  it('expands the places into the stations a planner is asked about', () => {
    expect(journeyEnds(['1072'], ['PLY'], places)).toEqual({
      origins: ['EUS', 'KGX'],
      destinations: ['PLY'],
    });
  });

  it('plans from a group to one of its own members, dropping it from the larger side', () => {
    // The refusal this replaced: London Terminals → Euston emptied the destinations and reported
    // "pick two different stations", when there were plainly other terminals to leave from.
    expect(journeyEnds(['1072'], ['EUS'], places)).toEqual({
      origins: ['KGX'],
      destinations: ['EUS'],
    });
  });

  it('plans into a group from one of its own members, the other way round', () => {
    expect(journeyEnds(['EUS'], ['1072'], places)).toEqual({
      origins: ['EUS'],
      destinations: ['KGX'],
    });
  });

  it('leaves a query with no overlap alone', () => {
    expect(journeyEnds(['1072'], ['PLY'], places).origins).toEqual(['EUS', 'KGX']);
  });

  it('drops from one side only where the two are the same size', () => {
    expect(journeyEnds(['1072'], ['heathrow-bus'], places)).toEqual({
      origins: ['EUS', 'KGX'],
      destinations: ['PLY'],
    });
  });

  it('refuses the same place on both sides, and says so', () => {
    expect(journeyEnds(['KGX'], ['KGX'], places).problem).toBe(
      'origin and destination are the same place',
    );
    expect(journeyEnds(['1072'], ['1072'], places).problem).toBe(
      'origin and destination are the same place',
    );
  });

  it('says which is missing when a side names nothing', () => {
    expect(journeyEnds([], ['PLY'], places).problem).toBe('name an origin and a destination');
    expect(journeyEnds(['PLY'], [], places).problem).toBe('name an origin and a destination');
  });
});
