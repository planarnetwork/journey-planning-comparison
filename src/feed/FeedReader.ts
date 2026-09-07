import type { FeedIndex, MetaCommand, MetaResponse, TripMeta } from './types';

/**
 * Reads the parts of the feed the planner throws away, in a worker of its own.
 *
 * The index comes back once — a few thousand stations, small enough to send. The trips do not:
 * there are hundreds of thousands of them and only the ones named by a journey on screen are ever
 * wanted, so they stay in the worker and are asked for by id.
 */
export class FeedReader {
  private readonly pending = new Map<
    number,
    { resolve: (response: MetaResponse) => void; reject: (error: Error) => void }
  >();
  private nextId = 1;

  constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<MetaResponse>) => {
      const waiting = this.pending.get(event.data.id);
      if (!waiting) return;
      this.pending.delete(event.data.id);
      waiting.resolve(event.data);
    };
    worker.onerror = (event) => {
      this.fail(new Error(event.message || 'The feed reader failed'));
    };
  }

  async load(bytes: ArrayBuffer): Promise<FeedIndex> {
    const response = await this.send({ type: 'load', bytes });
    if (response.type !== 'loaded') throw new Error(message(response));
    return response.index;
  }

  /** Who runs each of these trips, and under what headcode. */
  async describeTrips(ids: readonly string[]): Promise<(TripMeta | null)[]> {
    if (ids.length === 0) return [];
    const response = await this.send({ type: 'trips', ids });
    if (response.type !== 'trips') throw new Error(message(response));
    return response.meta;
  }

  terminate(): void {
    this.fail(new Error('The feed reader was stopped'));
    this.worker.terminate();
  }

  private send(command: MetaCommand): Promise<MetaResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...command, id });
    });
  }

  /** Nothing is left waiting on a worker that is not coming back. */
  private fail(error: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
  }
}

const message = (response: MetaResponse): string =>
  response.type === 'error' ? response.message : `Unexpected reply ${response.type}`;

/** The worker is constructed here rather than by the caller, since only this module resolves it. */
export const createFeedReader = (): FeedReader =>
  new FeedReader(new Worker(new URL('./meta.worker.ts', import.meta.url), { type: 'module' }));
