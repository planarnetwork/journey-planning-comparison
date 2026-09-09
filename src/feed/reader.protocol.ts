import type { LoadProgress } from '../planners/types';
import type { FeedIndex, GroupIndex } from './types';

export interface ReaderRequest {
  bytes: ArrayBuffer;
}

/** The feed as the page needs it: names, groups, and how much of it there was. */
export interface FeedDescription {
  index: FeedIndex;
  groups: GroupIndex;
  trips: number;
}

export type ReaderMessage =
  | { type: 'progress'; progress: LoadProgress }
  | ({ type: 'described' } & FeedDescription)
  | { type: 'failed'; message: string };
