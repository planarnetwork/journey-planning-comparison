import type { UnavailablePlanner } from '../feed/feed';
import type { Planner, Threaded } from '../planners/types';
import type { QueryAction, QueryState } from '../state/query';
import { plannerColor } from '../theme/colors';
import styles from './Sidebar.module.css';
import { StationInput } from './StationInput';
import { TimeInput } from './TimeInput';

interface SidebarProps {
  query: QueryState;
  planners: readonly Planner[];
  /** Planners that could not read the feed, shown so their absence is not a mystery. */
  unavailable: readonly UnavailablePlanner[];
  /** Planners that can be given more than one worker, with the count each is on. */
  threaded: readonly (Planner & Threaded)[];
  threads: ReadonlyMap<string, number>;
  /** Counts this machine has the cores for. */
  choices: readonly number[];
  /** A planner is rebuilding its workers, so nothing can be asked of it yet. */
  rebuilding: boolean;
  dispatch: (action: QueryAction) => void;
  onRun: () => void;
  onThreads: (planner: Planner & Threaded, count: number) => void;
}

export function Sidebar({
  query,
  planners,
  unavailable,
  threaded,
  threads,
  choices,
  rebuilding,
  dispatch,
  onRun,
  onThreads,
}: SidebarProps) {
  const set = (field: keyof QueryState) => (value: string | number) =>
    dispatch({ type: 'set', field, value });

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onRun();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Journey</span>
        <StationInput
          title="Origin"
          placeholder="station, group or several"
          multi
          value={query.origin}
          onChange={set('origin')}
          onSubmit={onRun}
        />
        <StationInput
          title="Destination"
          placeholder="station, group or several"
          multi
          value={query.dest}
          onChange={set('dest')}
          onSubmit={onRun}
        />
        <div className={`${styles.row2} ${styles.row2tight}`}>
          <div className={styles.field}>
            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              value={query.date}
              onChange={(e) => set('date')(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
          <TimeInput title="Depart" value={query.time} onChange={set('time')} onSubmit={onRun} />
        </div>
        <StationInput
          title="Via"
          placeholder="optional"
          value={query.via}
          onChange={set('via')}
          onSubmit={onRun}
        />
        <StationInput
          title="Avoid"
          placeholder="comma-separated"
          multi
          value={query.avoid}
          onChange={set('avoid')}
          onSubmit={onRun}
        />
        <div className={styles.hint}>
          Every field takes a group as readily as a station — London Terminals, Glasgow Cen/QSt —
          and origin and destination take several places at once, comma separated. Either way it is
          one search over the whole set, not one search each.
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Planners</span>
        <div className={styles.algorithms}>
          {planners.map((planner, i) => {
            const on = query.planners.includes(planner.id);
            return (
              <button
                type="button"
                key={planner.id}
                className={on ? `${styles.algorithm} ${styles.algorithmOn}` : styles.algorithm}
                style={{ '--h': plannerColor(planner) } as React.CSSProperties}
                onClick={() => dispatch({ type: 'togglePlanner', id: planner.id })}
                title={`${planner.pkg} ${planner.version}`}
              >
                <span className={styles.swatch} />
                <span>
                  <b>{planner.name}</b>
                  <i>{planner.sub}</i>
                </span>
                <kbd>{i + 1}</kbd>
              </button>
            );
          })}
          {unavailable.map(({ planner, message }) => (
            <div key={planner.id} className={styles.unavailable} title={message}>
              <span className={styles.swatch} />
              <span>
                <b>{planner.name}</b>
                <i>{planner.sub} — could not load</i>
              </span>
            </div>
          ))}
        </div>
      </div>

      {threaded.length > 0 && choices.length > 1 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Threads</span>
          {threaded.map((planner) => {
            const on = threads.get(planner.id) ?? planner.threads;
            return (
              <div key={planner.id} className={styles.threads}>
                <span className={styles.threadName}>{planner.name}</span>
                <div className={styles.choices}>
                  {choices.map((count) => (
                    <button
                      type="button"
                      key={count}
                      className={
                        count === on ? `${styles.choice} ${styles.choiceOn}` : styles.choice
                      }
                      disabled={rebuilding}
                      onClick={() => onThreads(planner, count)}
                      title={`Scan on ${count} worker${count === 1 ? '' : 's'}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className={styles.hint}>
            {rebuilding
              ? 'rebuilding — each worker reads the feed again'
              : 'A worker holds a timetable of its own. Only searches that do not wait on each other — a via query’s onward legs — are spread over them.'}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Constraints</span>
        <div className={styles.row2}>
          <div className={styles.field}>
            <label htmlFor="num">Results</label>
            <input
              id="num"
              type="number"
              min={1}
              max={10}
              step={1}
              value={query.num}
              onChange={(e) => set('num')(Number(e.target.value))}
              onKeyDown={onEnter}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="maxx">Max changes</label>
            <input
              id="maxx"
              type="number"
              min={0}
              max={10}
              step={1}
              value={query.maxTransfers}
              onChange={(e) => set('maxTransfers')(Number(e.target.value))}
              onKeyDown={onEnter}
            />
          </div>
        </div>
        <div className={styles.hint}>
          Interchange time comes from the feed, per station, so there is no slider for it.
        </div>
      </div>

      <div className={styles.run}>
        <button type="button" onClick={onRun}>
          Run comparison
        </button>
        <div className={styles.hint}>⏎ in any field re-runs · 1–9 toggles planners</div>
      </div>
    </aside>
  );
}
