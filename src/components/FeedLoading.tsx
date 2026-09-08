import type { FeedStatus, PlannerLoad } from '../feed/feed';
import { FEED_URL } from '../feed/source';
import { plannerColor } from '../theme/colors';
import styles from './FeedLoading.module.css';

const PHASE_LABEL = {
  downloading: 'downloading',
  reading: 'reading the feed',
  building: 'building',
} as const;

const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

interface FeedLoadingProps {
  status: Exclude<FeedStatus, { state: 'ready' }>;
}

/**
 * What the page shows until there is a timetable to plan against.
 *
 * The feed is 21MB compressed and a couple of hundred million rows uncompressed, and every planner
 * builds its own out of it, so this is a wait worth accounting for rather than a spinner.
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
  const loading = status.state === 'loading' ? status : null;
  const total = loading?.bytesTotal;
  const read = loading?.bytesRead ?? 0;
  const fraction = total ? read / total : null;

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.phase}>Downloading the feed</div>
        <div className={styles.track}>
          <div
            className={fraction === null ? `${styles.bar} ${styles.barIndeterminate}` : styles.bar}
            style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <div className={styles.detail}>
          <span>{total ? `${megabytes(read)} of ${megabytes(total)}` : megabytes(read)}</span>
          <span>{fraction === null ? '' : `${Math.round(fraction * 100)}%`}</span>
        </div>

        {/* Every planner builds its own timetable from the same bytes, at the same time. */}
        {loading?.downloaded && loading.planners.length > 0 && (
          <div className={styles.planners}>
            {loading.planners.map((load) => (
              <PlannerRow key={load.planner.id} load={load} />
            ))}
          </div>
        )}
      </div>
      <div className={styles.note}>
        A national GTFS feed from planarnetwork/gb-transit, parsed in the browser. Nothing is sent
        anywhere: every timetable is built in a worker on this machine.
      </div>
    </>
  );
}

function PlannerRow({ load }: { load: PlannerLoad }) {
  const { planner, progress, done } = load;
  const detail = done
    ? 'ready'
    : progress
      ? [
          PHASE_LABEL[progress.phase],
          progress.entry,
          progress.rows ? `${progress.rows.toLocaleString()} rows` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'waiting';

  return (
    <div
      className={done ? `${styles.planner} ${styles.plannerDone}` : styles.planner}
      style={{ '--h': plannerColor(planner) } as React.CSSProperties}
    >
      <span className={styles.plannerDot} />
      <b>{planner.name}</b>
      <i>{planner.sub}</i>
      <span className={styles.plannerState}>{detail}</span>
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <div className={styles.panel}>
      <div className={styles.phase}>The feed could not be loaded</div>
      <div className={styles.error}>{message}</div>
      <div className={styles.note}>
        The feed is read from <code>{FEED_URL}</code>, which gb-transit publishes alongside its
        website. A 404 there means no feed has been published yet. Set <code>VITE_FEED_URL</code> to
        read one from somewhere else.
      </div>
    </div>
  );
}
