import type { UnavailablePlanner } from '../feed/feed';
import type { Planner } from '../planners/types';
import type { QueryAction, QueryState } from '../state/query';
import { plannerColor } from '../theme/colors';
import styles from './Sidebar.module.css';
import { StationInput } from './StationInput';

interface SidebarProps {
  query: QueryState;
  planners: readonly Planner[];
  /** Planners that could not read the feed, shown so their absence is not a mystery. */
  unavailable: readonly UnavailablePlanner[];
  dispatch: (action: QueryAction) => void;
  onRun: () => void;
}

export function Sidebar({ query, planners, unavailable, dispatch, onRun }: SidebarProps) {
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
          placeholder="station or CRS"
          value={query.origin}
          onChange={set('origin')}
          onSubmit={onRun}
        />
        <StationInput
          title="Destination"
          placeholder="station or CRS"
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
          <div className={styles.field}>
            <label htmlFor="time">Depart</label>
            <input
              id="time"
              type="time"
              value={query.time}
              onChange={(e) => set('time')(e.target.value)}
              onKeyDown={onEnter}
            />
          </div>
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
