import { version } from 'transfer-pattern-planner/package.json';
import type { FeedIndex } from '../feed/types';
import { runProfileQuery } from './profile';
import type { PlainJourney } from './toJourney';
import {
  isEvent,
  type PatternSource,
  type TransferPatternCommand,
  type TransferPatternMessage,
  type TransferPatternResponse,
} from './transferPattern.protocol';
import type { LoadedFeed, LoadProgress, Planner, PlannerQuery, PlannerRun } from './types';

export interface TransferPatternOptions {
  id: string;
  name: string;
  sub: string;
  hue: number;
  patterns: PatternSource;
}

/**
 * planarnetwork/transfer-pattern-planner, in a worker written here because the package ships none.
 *
 * Patterns are worked out ahead of time, so a query is not a search of the timetable but a walk of
 * the paths already known to run between two stations, with the timetable hung off them. That is
 * the interesting comparison against RAPTOR: the work moved to a pre-processing step, in exchange
 * for having to hold — or fetch — what that step produced.
 */
export class TransferPatternPlanner implements Planner {
  readonly id: string;
  readonly name: string;
  readonly sub: string;
  readonly pkg = 'transfer-pattern-planner';
  readonly version = version;
  readonly hue: number;

  private readonly patterns: PatternSource;
  private worker: Worker | undefined;
  private readonly pending = new Map<
    number,
    { resolve: (response: TransferPatternResponse) => void; reject: (error: Error) => void }
  >();
  private onProgress: ((progress: LoadProgress) => void) | undefined;
  private nextId = 1;

  constructor(options: TransferPatternOptions) {
    this.id = options.id;
    this.name = options.name;
    this.sub = options.sub;
    this.hue = options.hue;
    this.patterns = options.patterns;
  }

  async load(
    bytes: ArrayBuffer,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<LoadedFeed> {
    const worker = new Worker(new URL('./transferPattern.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<TransferPatternMessage>) => this.receive(event.data);
    worker.onerror = (event) => this.fail(new Error(event.message || `${this.name} failed`));
    this.worker = worker;
    this.onProgress = onProgress;

    try {
      const response = await this.send({ type: 'load', bytes, patterns: this.patterns });
      if (response.type !== 'loaded') throw new Error(message(response));
      return { stops: response.stops, trips: response.trips };
    } finally {
      this.onProgress = undefined;
    }
  }

  plan(query: PlannerQuery, feed: FeedIndex): Promise<PlannerRun> {
    return runProfileQuery(this.search, query, feed);
  }

  terminate(): void {
    this.fail(new Error(`${this.name} was stopped`));
    this.worker?.terminate();
    this.worker = undefined;
  }

  private readonly search = async (
    origins: string[],
    destinations: string[],
    date: Date,
    seconds: number,
  ): Promise<PlainJourney[]> => {
    const response = await this.send({
      type: 'plan',
      origins,
      destinations,
      date: date.getTime(),
      time: seconds,
    });
    if (response.type !== 'planned') throw new Error(message(response));
    return response.journeys;
  };

  private send(command: TransferPatternCommand): Promise<TransferPatternResponse> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('No feed has been loaded yet'));

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...command, id });
    });
  }

  private receive(message: TransferPatternMessage): void {
    if (isEvent(message)) {
      this.onProgress?.(message.progress);
      return;
    }

    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    waiting.resolve(message);
  }

  /** Nothing is left waiting on a worker that is not coming back. */
  private fail(error: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
  }
}

const message = (response: TransferPatternResponse): string =>
  response.type === 'error' ? response.message : `Unexpected reply ${response.type}`;
