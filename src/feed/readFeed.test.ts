import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readFeedMeta } from './readFeed';

const utf8 = (text: string) => new TextEncoder().encode(text);

/** A feed with the shape of the real one: platform stops under station parents, listed first. */
const FEED = {
  'agency.txt': utf8(['agency_id,agency_name', '=GW,GWR', '=VT,Avanti West Coast'].join('\n')),
  'routes.txt': utf8(
    [
      'route_id,agency_id,route_short_name,route_long_name',
      'GW,=GW,GWR,Great Western Railway',
      'VT,=VT,Avanti,Avanti West Coast',
    ].join('\n'),
  ),
  'stops.txt': utf8(
    [
      'stop_id,stop_code,stop_name,location_type,parent_station,platform_code,stop_lat,stop_lon',
      '9100PADTON2,PAD,London Paddington Platform 2,0,910GPADTON,2,51.5164,-0.1768',
      '9100PLYMTH5,PLY,PLYMOUTH PLATFORM 5,0,910GPLYMTH,5,50.3776,-4.1434',
      '9100EUSTON,EUS,LONDON EUSTON,0,910GEUSTON,,51.5282,-0.1337',
      '910GPADTON,PAD,London Paddington,1,,,51.5164,-0.1768',
      '910GPLYMTH,PLY,PLYMOUTH,1,,,50.3776,-4.1434',
      '910GEUSTON,EUS,LONDON EUSTON,1,,,51.5282,-0.1337',
    ].join('\n'),
  ),
  'transfers.txt': utf8(
    [
      'from_stop_id,to_stop_id,min_transfer_time,mode',
      '910GPADTON,910GEUSTON,840,TRANSFER|TUBE',
      '910GEUSTON,910GPADTON,840,WALK',
      '910GPADTON,910GPADTON,300,',
    ].join('\n'),
  ),
  'trips.txt': utf8(
    [
      'route_id,service_id,trip_id,trip_headsign,trip_short_name',
      'GW,6176,G14978_20260914_20261210,PLYMOUTH,1C78',
      'VT,6086,V10001_20260914_20261210,"GLASGOW CENTRAL, VIA CREWE",9S01',
    ].join('\n'),
  ),
  'feed_info.txt': utf8(
    [
      'feed_publisher_name,feed_start_date,feed_end_date,feed_version',
      'Planar Network,20260907,20261207,RJTTC951.ZIP',
    ].join('\n'),
  ),
  // Never inflated: nothing here reads a stop time.
  'stop_times.txt': utf8('trip_id,arrival_time\nG14978_20260914_20261210,09:03:00\n'),
};

describe('readFeedMeta', () => {
  it('resolves platform stops to the station they belong to', async () => {
    const { index } = await readFeedMeta(zipSync(FEED));

    expect(index.stops['9100PADTON2']).toEqual({ station: 'PAD', platform: '2' });
    expect(index.stops['9100PLYMTH5']).toEqual({ station: 'PLY', platform: '5' });
    expect(index.stops['9100EUSTON']).toEqual({ station: 'EUS', platform: null });
    // The station's own stop resolves to itself, so a trip calling there still has a station.
    expect(index.stops['910GPADTON']).toEqual({ station: 'PAD', platform: null });
  });

  it('quietens a name that shouts and leaves one that does not', async () => {
    const { index } = await readFeedMeta(zipSync(FEED));

    expect(index.stations.PAD!.name).toBe('London Paddington');
    expect(index.stations.PLY!.name).toBe('Plymouth');
    expect(index.stations.PAD).toMatchObject({ lat: 51.5164, lon: -0.1768 });
  });

  it('orders station codes by name, for autocomplete', async () => {
    const { index } = await readFeedMeta(zipSync(FEED));

    expect(index.codes).toEqual(['EUS', 'PAD', 'PLY']);
  });

  it('puts back the operator and headcode the planner drops', async () => {
    const { describe: describeTrip } = await readFeedMeta(zipSync(FEED));

    expect(describeTrip('G14978_20260914_20261210')).toEqual({
      toc: 'GW',
      operator: 'GWR',
      headcode: '1C78',
      headsign: 'Plymouth',
      route: 'Great Western Railway',
    });
    expect(describeTrip('nosuchtrip')).toBeNull();
  });

  it('reads a quoted field containing a comma', async () => {
    const { describe: describeTrip } = await readFeedMeta(zipSync(FEED));

    expect(describeTrip('V10001_20260914_20261210')?.headsign).toBe('Glasgow Central, Via Crewe');
  });

  it('takes the travelling tag out of a compound transfer mode', async () => {
    const { index } = await readFeedMeta(zipSync(FEED));

    expect(index.transfers['PAD|EUS']).toBe('tube');
    expect(index.transfers['EUS|PAD']).toBe('foot');
    // A station's transfer to itself is its interchange time, not a change of place.
    expect(index.transfers['PAD|PAD']).toBeUndefined();
  });

  it('reads the period the feed covers', async () => {
    const { index } = await readFeedMeta(zipSync(FEED));

    expect(index.feedInfo).toEqual({
      startDate: 20260907,
      endDate: 20261207,
      version: 'RJTTC951.ZIP',
    });
    expect(index.trips).toBe(2);
  });
});

/**
 * The same reader against the feed the app actually loads. Skipped unless RAILPLAN_FEED points at
 * a downloaded gtfs.zip, because a national feed is 21MB and no unit test should fetch one.
 */
describe.skipIf(!process.env.RAILPLAN_FEED)('readFeedMeta, against the real feed', () => {
  it('indexes the national feed', async () => {
    const bytes = new Uint8Array(readFileSync(process.env.RAILPLAN_FEED!));
    const started = Date.now();
    const { index, describe: describeTrip } = await readFeedMeta(bytes);
    console.log(
      `read in ${Date.now() - started}ms: ${index.codes.length} stations, ${index.trips} trips`,
    );

    expect(index.codes.length).toBeGreaterThan(2500);
    expect(index.stations.KGX).toMatchObject({ code: 'KGX' });
    expect(index.stops['9100PADTON2']).toEqual({ station: 'PAD', platform: '2' });
    expect(Object.keys(index.operators)).toContain('GW');
    expect(index.operators.GW).toBe('GWR');
    expect(index.transfers['KGX|PAD']).toBe('tube');
    expect(describeTrip('G14978_20260914_20261210')).toMatchObject({ toc: 'GW' });
  }, 120_000);
});
