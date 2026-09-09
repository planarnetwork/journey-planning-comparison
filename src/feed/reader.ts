import type { LoadProgress } from '../planners/types';
import type { FeedDescription, ReaderMessage } from './reader.protocol';

/**
 * Read the feed for the page.
 *
 * The worker is built, asked once and stopped, because there is nothing to ask it twice: what comes
 * back is the whole of what the page needs, and holding the feed after that would be holding four
 * hundred megabytes for nothing.
 */
export function describeFeed(
  bytes: ArrayBuffer,
  onProgress?: (progress: LoadProgress) => void,
): Promise<FeedDescription> {
  const worker = new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' });

  return new Promise<FeedDescription>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ReaderMessage>) => {
      const message = event.data;
      if (message.type === 'progress') return onProgress?.(message.progress);
      if (message.type === 'failed') return reject(new Error(message.message));

      const { index, groups, trips } = message;
      resolve({ index, groups, trips });
    };
    worker.onerror = (event) => reject(new Error(event.message || 'The feed could not be read'));
    worker.postMessage({ bytes } satisfies { bytes: ArrayBuffer });
  }).finally(() => {
    worker.terminate();
  });
}
