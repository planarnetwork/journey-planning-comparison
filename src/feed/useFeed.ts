import { useEffect, useSyncExternalStore } from 'react';
import { type FeedStatus, feedStatus, openFeed, watchFeed } from './feed';

/**
 * Subscribe to the one feed load.
 *
 * The load itself is a module singleton, so this only starts it if nobody else has and reports
 * where it has got to. Mounting twice, as StrictMode does, joins the same load rather than
 * fetching 21MB twice.
 */
export function useFeed(): FeedStatus {
  const status = useSyncExternalStore(watchFeed, feedStatus, feedStatus);

  useEffect(() => {
    // Failures arrive through the status; this catch only stops an unhandled rejection.
    void openFeed().catch(() => {});
  }, []);

  return status;
}
