import { memo } from 'react';
import { formatDuration, formatTime } from '../journey/time';
import { isTrainLeg } from '../journey/types';
import type { PlannerResult } from '../planners/types';
import { operatorColor, plannerColor } from '../theme/colors';
import type { Selection } from '../types';
import styles from './Columns.module.css';
import { LegList } from './LegList';

interface ColumnsProps {
  results: PlannerResult[];
  /** What to say when there is nothing to show, which is not always the same thing. */
  empty: string;
  selection: Selection | null;
  expanded: ReadonlySet<string>;
  onSelect: (selection: Selection) => void;
  onToggleLeg: (key: string) => void;
}

export function Columns({
  results,
  empty,
  selection,
  expanded,
  onSelect,
  onToggleLeg,
}: ColumnsProps) {
  if (!results.length) {
    return (
      <div className={styles.columns}>
        <div className={styles.empty}>{empty}</div>
      </div>
    );
  }

  const fastest = Math.min(...results.map((r) => r.ms));

  return (
    <div className={styles.columns}>
      {results.map((result) => (
        <Column
          key={result.planner.id}
          result={result}
          fastest={fastest}
          selectedIndex={selection?.planner === result.planner.id ? selection.index : null}
          expanded={expanded}
          onSelect={onSelect}
          onToggleLeg={onToggleLeg}
        />
      ))}
    </div>
  );
}

interface ColumnProps {
  result: PlannerResult;
  fastest: number;
  selectedIndex: number | null;
  expanded: ReadonlySet<string>;
  onSelect: (selection: Selection) => void;
  onToggleLeg: (key: string) => void;
}

const Column = memo(function Column({
  result,
  fastest,
  selectedIndex,
  expanded,
  onSelect,
  onToggleLeg,
}: ColumnProps) {
  const { planner, journeys } = result;

  return (
    <div className={styles.column} style={{ '--h': plannerColor(planner) } as React.CSSProperties}>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.dot} />
          <b>{planner.name}</b>
        </div>
        <i>
          {planner.sub} · {planner.pkg}@{planner.version}
        </i>
        <div className={styles.perf}>
          <span
            className={result.ms === fastest ? `${styles.stat} ${styles.statBest}` : styles.stat}
          >
            <b>{result.ms.toFixed(1)}</b> ms
          </span>
          <span className={styles.stat}>
            <b>{result.queries}</b> {result.queries === 1 ? 'query' : 'queries'}
          </span>
          <span className={styles.stat}>
            <b>{journeys.length}</b> found
          </span>
        </div>
      </div>

      <div className={styles.body}>
        {result.error && <div className={styles.empty}>{result.error}</div>}
        {!result.error && journeys.length === 0 && (
          <div className={styles.empty}>no itinerary within the current constraints</div>
        )}
        {journeys.map((journey, index) => {
          const selected = selectedIndex === index;
          return (
            <div
              // Journeys are identified by their departure/arrival/changes triple.
              key={`${journey.dep}-${journey.arr}-${journey.transfers}`}
              className={selected ? `${styles.journey} ${styles.journeyOn}` : styles.journey}
            >
              {/* The summary selects the journey; the legs below are their own buttons, so the row
                  itself cannot be one. */}
              <button
                type="button"
                className={styles.select}
                onClick={() => onSelect({ planner: planner.id, index })}
              >
                <div className={styles.journeyHead}>
                  <span className={styles.clock}>{formatTime(journey.dep)}</span>
                  <span className={styles.arrow}>→</span>
                  <span className={styles.clock}>{formatTime(journey.arr)}</span>
                  <span className={styles.spacer} />
                  <span className={styles.duration}>
                    {formatDuration(journey.duration)} · {journey.transfers} chg
                    {journey.footLegs > 0 && ` · ${journey.footLegs}✱`}
                  </span>
                </div>
                <div className={styles.operators}>
                  {journey.legs.filter(isTrainLeg).map((leg) => (
                    <s
                      key={`${leg.trip}-${leg.from}`}
                      title={leg.operator}
                      style={{ '--o': operatorColor(leg.toc) } as React.CSSProperties}
                    />
                  ))}
                </div>
              </button>
              <LegList
                journey={journey}
                expanded={expanded}
                keyFor={(legIndex) => `${planner.id}|${index}|${legIndex}`}
                onToggle={(key) => {
                  onSelect({ planner: planner.id, index });
                  onToggleLeg(key);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
