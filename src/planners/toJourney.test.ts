import type { PlainJourney, StopTime } from 'raptor-journey-planner';
import { describe, expect, it } from 'vitest';
import type { FeedIndex } from '../feed/types';
import { isTrainLeg } from '../journey/types';
import { toJourney, transferMode } from './toJourney';

const index: FeedIndex = {
  stations: {
    KGX: { code: 'KGX', name: 'London Kings Cross', lat: 51.53, lon: -0.12 },
    PAD: { code: 'PAD', name: 'London Paddington', lat: 51.51, lon: -0.17 },
    RDG: { code: 'RDG', name: 'Reading', lat: 51.45, lon: -0.97 },
    TAU: { code: 'TAU', name: 'Taunton', lat: 51.02, lon: -3.1 },
    PLY: { code: 'PLY', name: 'Plymouth', lat: 50.37, lon: -4.14 },
  },
  codes: ['KGX', 'PAD', 'PLY', 'RDG', 'TAU'],
  stops: {
    '9100KNGX': { station: 'KGX', platform: null },
    '9100PADTON2': { station: 'PAD', platform: '2' },
    '9100RDNGSTN7': { station: 'RDG', platform: '7' },
    '9100TAUNTON': { station: 'TAU', platform: null },
    '9100PLYMTH5': { station: 'PLY', platform: '5' },
  },
  routes: { GW: { toc: 'GW', name: 'Great Western Railway' } },
  operators: { GW: 'GWR' },
};

const at = (stop: string, arrival: number, departure: number, calls = true): StopTime => ({
  stop,
  arrivalTime: arrival,
  departureTime: departure,
  pickUp: calls,
  dropOff: calls,
});

const hhmm = (h: number, m: number) => h * 3600 + m * 60;

const trip = {
  tripId: 'G14978',
  serviceId: '6176',
  stopTimes: [],
  routeId: 'GW',
  shortName: '1C78',
  headsign: 'PLYMOUTH',
};

/** 08:48 Tube to Paddington, 09:03 train calling at Reading and Plymouth, passing Taunton. */
const journey: PlainJourney = {
  departureTime: hhmm(8, 48),
  arrivalTime: hhmm(12, 14),
  legs: [
    {
      origin: 'KGX',
      destination: 'PAD',
      duration: 900,
      startTime: 60,
      endTime: 86340,
      mode: 'TRANSFER|TUBE',
    },
    {
      origin: 'PAD',
      destination: 'PLY',
      trip,
      stopTimes: [
        at('9100PADTON2', hhmm(9, 3), hhmm(9, 3)),
        at('9100RDNGSTN7', hhmm(9, 26), hhmm(9, 29)),
        at('9100TAUNTON', hhmm(10, 40), hhmm(10, 40), false),
        at('9100PLYMTH5', hhmm(12, 14), hhmm(12, 14)),
      ],
    },
  ],
};

const build = () => toJourney(journey, index);

describe('toJourney', () => {
  it('walks the clock forward so a leading transfer is timed', () => {
    const result = build()!;

    // The journey departs before the train does, because there is a Tube ride first.
    expect(result.dep).toBe(8 * 60 + 48);
    expect(result.arr).toBe(12 * 60 + 14);
    expect(result.duration).toBe(206);

    const transfer = result.legs[0]!;
    expect(transfer.dep).toBe(8 * 60 + 48);
    expect(transfer.arr).toBe(9 * 60 + 3);
  });

  it('keeps passing points on the line but out of the calling points', () => {
    const train = build()!.legs[1]!;
    if (!isTrainLeg(train)) throw new Error('expected a train leg');

    expect(train.stops).toEqual(['PAD', 'RDG', 'TAU', 'PLY']);
    expect(train.points.map((p) => p.stop)).toEqual(['PAD', 'RDG', 'PLY']);
  });

  it('leaves an arrival off the first call and a departure off the last', () => {
    const train = build()!.legs[1]!;
    if (!isTrainLeg(train)) throw new Error('expected a train leg');

    expect(train.points[0]).toEqual({ stop: 'PAD', arr: null, dep: 543, platform: '2' });
    expect(train.points[1]).toEqual({ stop: 'RDG', arr: 566, dep: 569, platform: '7' });
    expect(train.points[2]).toEqual({ stop: 'PLY', arr: 734, dep: null, platform: '5' });
  });

  it('names the operator from the trip and the index between them', () => {
    const train = build()!.legs[1]!;
    if (!isTrainLeg(train)) throw new Error('expected a train leg');

    expect(train).toMatchObject({
      toc: 'GW',
      operator: 'GWR',
      headcode: '1C78',
      headsign: 'Plymouth',
      route: 'Great Western Railway',
      trip: 'G14978',
    });
    expect(build()!.tocs).toEqual(['GW']);
  });

  it('says so rather than guessing when a trip names no route', () => {
    const bare: PlainJourney = {
      ...journey,
      legs: [
        journey.legs[0]!,
        { ...journey.legs[1]!, trip: { tripId: 'X', serviceId: '1', stopTimes: [] } },
      ],
    };

    const train = toJourney(bare, index)!.legs[1]!;
    if (!isTrainLeg(train)) throw new Error('expected a train leg');
    expect(train.operator).toBe('Unknown operator');
    expect(train.headcode).toBe('');
    expect(train.toc).toBe('??');
  });

  it('counts changes between trains, not legs', () => {
    const result = build()!;

    // One train and one Tube ride is nought changes and one foot leg, not one change.
    expect(result.transfers).toBe(0);
    expect(result.footLegs).toBe(1);
  });

  it('times a change from when the previous train arrived', () => {
    const withChange: PlainJourney = {
      departureTime: hhmm(9, 3),
      arrivalTime: hhmm(12, 14),
      legs: [
        {
          origin: 'PAD',
          destination: 'RDG',
          trip,
          stopTimes: [
            at('9100PADTON2', hhmm(9, 3), hhmm(9, 3)),
            at('9100RDNGSTN7', hhmm(9, 26), hhmm(9, 26)),
          ],
        },
        { origin: 'RDG', destination: 'RDG', duration: 300, startTime: 60, endTime: 86340 },
        {
          origin: 'RDG',
          destination: 'PLY',
          trip,
          stopTimes: [
            at('9100RDNGSTN7', hhmm(9, 40), hhmm(9, 40)),
            at('9100PLYMTH5', hhmm(12, 14), hhmm(12, 14)),
          ],
        },
      ],
    };

    const result = toJourney(withChange, index)!;
    const change = result.legs[1]!;

    // The walk across Reading starts when the first train gets in, not when the second leaves.
    expect(change.dep).toBe(9 * 60 + 26);
    expect(change.arr).toBe(9 * 60 + 31);
    expect(result.transfers).toBe(1);
  });

  it('names a stop the index does not know rather than dropping it', () => {
    const elsewhere: PlainJourney = {
      ...journey,
      legs: [
        journey.legs[0]!,
        {
          ...journey.legs[1]!,
          stopTimes: [at('9999UNKNOWN', 100, 100), at('9100PLYMTH5', 200, 200)],
        },
      ],
    };

    const train = toJourney(elsewhere, index)!.legs[1]!;
    if (!isTrainLeg(train)) throw new Error('expected a train leg');
    expect(train.stops).toEqual(['9999UNKNOWN', 'PLY']);
  });

  it('has no journey where there is no train', () => {
    const walkOnly: PlainJourney = {
      departureTime: 0,
      arrivalTime: 900,
      legs: [journey.legs[0]!],
    };
    expect(toJourney(walkOnly, index)).toBeNull();
  });
});

describe('transferMode', () => {
  it('takes the travelling tag out of a compound mode', () => {
    expect(transferMode('TRANSFER|TUBE')).toBe('tube');
    expect(transferMode('METRO|WALK')).toBe('tube');
    expect(build()!.legs[0]!.mode).toBe('tube');
  });

  it('maps each way of travelling the feed names', () => {
    expect(transferMode('WALK')).toBe('foot');
    expect(transferMode('BUS')).toBe('bus');
    expect(transferMode('FERRY')).toBe('ferry');
    expect(transferMode('TRAM')).toBe('tube');
  });

  it('walks when the feed says nothing, or says only that it is a transfer', () => {
    expect(transferMode(undefined)).toBe('foot');
    expect(transferMode('')).toBe('foot');
    expect(transferMode('TRANSFER')).toBe('foot');
  });
});
