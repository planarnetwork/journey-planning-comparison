import type { FeedStatus } from '../feed/feed';
import styles from './FeedLoading.module.css';

const PHASE_LABEL = {
  downloading: 'Downloading the feed',
  reading: 'Reading the feed',
  building: 'Building the timetable',
} as const;

const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

interface FeedLoadingProps {
  status: Exclude<FeedStatus, { state: 'ready' }>;
}

/**
 * What the page shows until there is a timetable to plan against.
 *
 * The feed is 21MB compressed and a couple of hundred million rows uncompressed, so this is a wait
 * worth accounting for rather than a spinner.
 */
export function FeedLoading({ status }: FeedLoadingProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        RAILPLAN<span>·</span>LAB
      </div>
      {status.state === 'failed' ? (
        <Failed message={status.message} />
      ) : (
        <Progress status={status} />
      )}
    </div>
  );
}

function Progress({ status }: { status: Exclude<FeedStatus, { state: 'ready' | 'failed' }> }) {
  const progress = status.state === 'loading' ? status.progress : null;
  const phase = progress?.phase ?? 'downloading';
  const total = progress?.bytesTotal;
  const read = progress?.bytesRead ?? 0;
  // Only the download knows how far through it is; the parse reports rows, not a fraction.
  const fraction = phase === 'downloading' && total ? read / total : null;

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.phase}>{PHASE_LABEL[phase]}</div>
        <div className={styles.track}>
          <div
            className={fraction === null ? `${styles.bar} ${styles.barIndeterminate}` : styles.bar}
            style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <div className={styles.detail}>
          <span>
            {progress?.entry ??
              (total ? `${megabytes(read)} of ${megabytes(total)}` : megabytes(read))}
          </span>
          <span>
            {progress && progress.rows > 0
              ? `${progress.rows.toLocaleString()} rows`
              : fraction !== null
                ? `${Math.round(fraction * 100)}%`
                : ''}
          </span>
        </div>
      </div>
      <div className={styles.note}>
        A national GTFS feed from planarnetwork/dtd2mysql, parsed in the browser. Nothing is sent
        anywhere: the timetable is built in a worker on this machine.
      </div>
    </>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <div className={styles.panel}>
      <div className={styles.phase}>The feed could not be loaded</div>
      <div className={styles.error}>{message}</div>
      <div className={styles.note}>
        The release is served without CORS headers, so the page reads it through the dev server's
        proxy. Check that the app is running under <code>yarn dev</code> or{' '}
        <code>yarn preview</code>.
      </div>
    </div>
  );
}
