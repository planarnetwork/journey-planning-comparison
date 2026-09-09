import {
  DepartAfterQuery,
  LazyTransferTreeRepository,
  loadGtfs,
  PatternLoader,
  StopTable,
  type TransferPatternRepository,
  UrlPatternProvider,
} from 'transfer-pattern-planner';
import type { PlainJourney, PlainLeg, PlainTrip } from './toJourney';
import type {
  PatternSource,
  TransferPatternMessage,
  TransferPatternRequest,
  TransferPatternResponse,
} from './transferPattern.protocol';

/**
 * Holds the feed and the patterns, and answers queries against them.
 *
 * The package ships no worker of its own, unlike raptor, so this is that: the feed is hundreds of
 * megabytes of objects and the whole pattern set half a gigabyte more, and neither belongs on the
 * thread drawing the page.
 */
let query: DepartAfterQuery | undefined;

// `self` is typed as a Window here, because the DOM lib and the WebWorker lib cannot both be on
// without colliding, and the rest of the app needs the DOM one.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<TransferPatternRequest>) => void) | null;
  postMessage: (message: TransferPatternMessage) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  handle(request)
    .catch(
      (e: unknown): TransferPatternResponse => ({
        id: request.id,
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      }),
    )
    .then((response) => {
      scope.postMessage(response);
    });
};

async function handle(request: TransferPatternRequest): Promise<TransferPatternResponse> {
  switch (request.type) {
    case 'load':
      return load(request.id, request.bytes, request.patterns);
    case 'plan':
      return plan(request);
  }
}

async function load(
  id: number,
  bytes: ArrayBuffer,
  source: PatternSource,
): Promise<TransferPatternResponse> {
  // One table of stations for the feed and the patterns, so that the two speak of a station the
  // same way. Whichever reaches a station first numbers it, which is why they can be read at once.
  const stops = new StopTable();

  scope.postMessage({
    type: 'progress',
    progress: { phase: 'reading', bytesRead: bytes.byteLength, rows: 0 },
  });

  const [gtfs, patterns] = await Promise.all([
    loadGtfs(new Uint8Array(bytes), stops),
    readPatterns(source, stops),
  ]);

  scope.postMessage({
    type: 'progress',
    progress: { phase: 'building', bytesRead: bytes.byteLength, rows: 0 },
  });

  query = new DepartAfterQuery(gtfs, patterns);

  return { id, type: 'loaded' };
}

/**
 * The whole pattern set, or a reader that fetches one station at a time.
 *
 * Eagerly it is one file of tens of megabytes, held in full. Lazily nothing is read until a query
 * names the station it departs from, and only the hundred most recently asked for are kept.
 */
function readPatterns(
  source: PatternSource,
  stops: StopTable,
): Promise<TransferPatternRepository> | TransferPatternRepository {
  if (source.kind === 'eager') {
    return new PatternLoader(stops).loadFromUrl(source.url);
  }

  return new LazyTransferTreeRepository(new UrlPatternProvider(source.base), stops);
}

async function plan(
  request: Extract<TransferPatternRequest, { type: 'plan' }>,
): Promise<TransferPatternResponse> {
  if (!query) {
    throw new Error('No feed has been loaded yet, send a load request before planning');
  }

  const journeys = await query.plan(
    request.origins,
    request.destinations,
    new Date(request.date),
    request.time,
  );

  return { id: request.id, type: 'planned', journeys: journeys.map(toPlainJourney) };
}

/**
 * Strip the parts of a journey that cannot survive the crossing.
 *
 * A trip's Service is a class, and posting a message copies an object's data but not the class it
 * belongs to, so it would arrive with its fields and without its methods — worse than leaving it
 * out, because the caller cannot see that it is broken. Whether a trip runs on a date is settled
 * here before the journey is returned anyway.
 */
function toPlainJourney(journey: {
  legs: unknown[];
  departureTime: number;
  arrivalTime: number;
}): PlainJourney {
  return {
    legs: journey.legs.map(toPlainLeg),
    departureTime: journey.departureTime,
    arrivalTime: journey.arrivalTime,
  };
}

function toPlainLeg(leg: unknown): PlainLeg {
  const timetableLeg = leg as {
    origin: string;
    destination: string;
    stopTimes?: PlainTrip['stopTimes'];
    trip?: PlainTrip & { service?: unknown };
    duration?: number;
    startTime?: number;
    endTime?: number;
    mode?: string;
  };

  if (timetableLeg.trip === undefined) {
    return {
      origin: timetableLeg.origin,
      destination: timetableLeg.destination,
      duration: timetableLeg.duration ?? 0,
      startTime: timetableLeg.startTime ?? 0,
      endTime: timetableLeg.endTime ?? 0,
      // The package types a transfer without the feed's mode; it is passed on where it is there.
      mode: timetableLeg.mode,
    };
  }

  return {
    origin: timetableLeg.origin,
    destination: timetableLeg.destination,
    stopTimes: timetableLeg.stopTimes ?? [],
    trip: {
      tripId: timetableLeg.trip.tripId,
      routeId: timetableLeg.trip.routeId,
      shortName: timetableLeg.trip.shortName,
      headsign: timetableLeg.trip.headsign,
      stopTimes: timetableLeg.trip.stopTimes,
    },
  };
}
