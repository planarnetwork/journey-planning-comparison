import { Fragment } from 'react';
import { useStations } from '../feed/stations';
import type { TransferMode } from '../feed/types';
import { formatTime } from '../journey/time';
import { isTrainLeg, type Journey, type TrainLeg, type TransferLeg } from '../journey/types';
import { operatorColor } from '../theme/colors';
import styles from './Columns.module.css';

const MODE_LABEL: Record<TransferMode, string> = {
  foot: 'on foot',
  tube: 'by Tube',
  bus: 'by bus',
  ferry: 'by ferry',
};

const MODE_VERB: Record<TransferMode, string> = {
  foot: 'Walk',
  tube: 'Tube',
  bus: 'Bus',
  ferry: 'Ferry',
};

interface LegListProps {
  journey: Journey;
  /** Keys of legs whose calling points are expanded. */
  expanded: ReadonlySet<string>;
  keyFor: (legIndex: number) => string;
  onToggle: (key: string) => void;
}

export function LegList({ journey, expanded, keyFor, onToggle }: LegListProps) {
  return (
    <div className={styles.legs}>
      {journey.legs.map((leg, i) => {
        const previous = journey.legs[i - 1];
        const next = journey.legs[i + 1];
        const key = keyFor(i);

        if (!isTrainLeg(leg)) {
          return (
            <TransferRow
              key={key}
              leg={leg}
              betweenTrains={!!previous && isTrainLeg(previous) && !!next && isTrainLeg(next)}
              nextPlatform={next && isTrainLeg(next) ? (next.points[0]?.platform ?? null) : null}
            />
          );
        }

        return (
          <Fragment key={key}>
            {previous && isTrainLeg(previous) && <ChangeRow previous={previous} leg={leg} />}
            <TrainRow leg={leg} open={expanded.has(key)} onToggle={() => onToggle(key)} />
          </Fragment>
        );
      })}
    </div>
  );
}

/** A platform, where the feed names one. Most feeds do not, so this renders nothing rather than a gap. */
function Platform({ at, label }: { at: string | null; label?: string }) {
  if (!at) return null;
  return (
    <>
      {label ? `${label} ` : ''}
      <u>{at}</u>
    </>
  );
}

function TransferRow({
  leg,
  betweenTrains,
  nextPlatform,
}: {
  leg: TransferLeg;
  betweenTrains: boolean;
  nextPlatform: string | null;
}) {
  const stations = useStations();
  const minutes = leg.arr - leg.dep;

  return (
    <div className={`${styles.leg} ${styles.transfer}`}>
      <div className={styles.times}>{minutes}m</div>
      <div className={styles.rail}>
        <i />
      </div>
      <div className={styles.info}>
        <b>
          {betweenTrains
            ? `change ${MODE_LABEL[leg.mode]} at ${stations.name(leg.from)}`
            : `${MODE_VERB[leg.mode]} to ${stations.name(leg.to)}`}
        </b>
        <span className={styles.platform}>
          {betweenTrains
            ? `${stations.name(leg.from)} → ${stations.name(leg.to)} · ${minutes} min`
            : `${formatTime(leg.dep)} → ${formatTime(leg.arr)} · ${minutes} min ${MODE_LABEL[leg.mode]}`}
          {nextPlatform && (
            <>
              {' · '}
              <Platform at={nextPlatform} label="dep" />
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function ChangeRow({ previous, leg }: { previous: TrainLeg; leg: TrainLeg }) {
  const stations = useStations();
  const gap = leg.dep - previous.arr;
  const from = previous.points[previous.points.length - 1]?.platform ?? null;
  const to = leg.points[0]?.platform ?? null;

  return (
    <div className={`${styles.leg} ${styles.transfer}`}>
      <div className={styles.times}>{gap}m</div>
      <div className={styles.rail}>
        <i />
      </div>
      <div className={styles.info}>
        <b>change at {stations.name(previous.to)}</b>
        <span className={styles.platform}>
          {from || to ? (
            <>
              <Platform at={from} label="arr" />
              {from && to ? ' → ' : ''}
              <Platform at={to} label="dep" />
              {' · '}
            </>
          ) : null}
          {gap} min
        </span>
      </div>
    </div>
  );
}

function TrainRow({ leg, open, onToggle }: { leg: TrainLeg; open: boolean; onToggle: () => void }) {
  const stations = useStations();
  const from = leg.points[0]?.platform ?? null;
  const to = leg.points[leg.points.length - 1]?.platform ?? null;

  return (
    <>
      <button
        type="button"
        className={styles.leg}
        style={{ '--o': operatorColor(leg.toc) } as React.CSSProperties}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <div className={styles.times}>
          {formatTime(leg.dep)}
          <s>{formatTime(leg.arr)}</s>
        </div>
        <div className={styles.rail}>
          <i />
        </div>
        <div className={styles.info}>
          <b>
            {stations.name(leg.from)} → {stations.name(leg.to)}
          </b>
          <span>
            {leg.operator}
            {leg.headcode && ` · ${leg.headcode}`} · {Math.max(leg.points.length - 1, 0)} stops ·{' '}
            {leg.arr - leg.dep} min
          </span>
          <span className={styles.platform}>
            {from || to ? (
              <>
                <Platform at={from} label="plat" />
                {from && to ? ' → ' : ''}
                <Platform at={to} />
                {' · '}
              </>
            ) : null}
            {open ? '▾' : '▸'} calling points
          </span>
        </div>
      </button>
      {open && (
        <div className={styles.callingPoints}>
          {/* A circular service can call at the same station twice, so the time is part of the key. */}
          {leg.points.map((point) => (
            <div key={`${point.stop}-${point.arr ?? point.dep}`} className={styles.callingPoint}>
              <em>{point.arr == null ? '—' : formatTime(point.arr)}</em>
              <em>{point.dep == null ? '—' : formatTime(point.dep)}</em>
              <b>{stations.name(point.stop)}</b>
              <u>{point.platform ? `pl ${point.platform}` : ''}</u>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
