import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { FeedSession } from '../feed/feed';
import { createStations, StationsProvider } from '../feed/stations';
import { formatTime, fromDateNumber, parseDate, parseTime, toDateNumber } from '../journey/time';
import { runComparison } from '../planners';
import type { PlannerResult } from '../planners/types';
import { initialQuery, type QueryState, queryReducer, toCode, toCodes } from '../state/query';
import type { MapSize, Selection, Theme } from '../types';
import { Columns } from './Columns';
import { Header } from './Header';
import { MapPane, mapCaption } from './MapPane';
import { Sidebar } from './Sidebar';

interface WorkbenchProps {
  feed: FeedSession;
  theme: Theme;
  mapSize: MapSize;
  onCycleMap: () => void;
  onToggleTheme: () => void;
}

export function Workbench({ feed, theme, mapSize, onCycleMap, onToggleTheme }: WorkbenchProps) {
  const stations = useMemo(() => createStations(feed.index), [feed.index]);
  const [query, dispatch] = useReducer(
    queryReducer,
    { index: feed.index, planners: feed.planners },
    initialQuery,
  );
  const [results, setResults] = useState<PlannerResult[]>([]);
  const [status, setStatus] = useState('no query');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // The reducer state is read inside `run`, but `run` must stay stable for the keyboard handler,
  // so read it through a ref rather than a dependency.
  const latest = useRef<QueryState>(query);
  latest.current = query;

  // Planning is asynchronous now that it happens in a worker, so an answer that arrives after a
  // later question was asked is dropped rather than shown.
  const generation = useRef(0);

  const run = useCallback(async () => {
    const current = latest.current;
    const origin = toCode(current.origin, stations.first);
    const dest = toCode(current.dest, stations.first);
    if (!origin || !dest || origin === dest) {
      setStatus('pick two different stations');
      return;
    }

    const date = parseDate(current.date);
    if (!date) {
      setStatus('unreadable date');
      return;
    }

    const { startDate, endDate } = feed.index.feedInfo;
    const on = toDateNumber(date);
    if (startDate && endDate && (on < startDate || on > endDate)) {
      setStatus(`feed covers ${fromDateNumber(startDate)} — ${fromDateNumber(endDate)}`);
      return;
    }

    const time = parseTime(current.time) ?? 480;
    const via = current.via.trim() ? toCode(current.via, stations.first) : null;
    const avoid = toCodes(current.avoid, stations.first).filter((c) => c !== origin && c !== dest);
    const num = Math.max(1, Math.min(10, current.num || 4));
    const maxTransfers = Math.max(0, Math.min(10, current.maxTransfers || 0));
    const planners = feed.planners.filter((planner) => current.planners.includes(planner.id));

    const mine = ++generation.current;
    setStatus('planning…');

    const next = await runComparison(planners, {
      origin,
      dest,
      date,
      time,
      via,
      avoid,
      num,
      maxTransfers,
    });
    if (mine !== generation.current) return;

    setResults(next);
    setExpanded(new Set());
    setSelection((previous) => {
      const keep =
        previous && next.some((r) => r.planner.id === previous.planner && r.journeys.length);
      if (keep) return previous;
      const first = next.find((r) => r.journeys.length);
      return first ? { planner: first.planner.id, index: 0 } : null;
    });

    const total = next.reduce((sum, r) => sum + r.ms, 0);
    const failed = next.find((r) => r.error);
    setStatus(
      failed
        ? `${failed.planner.name}: ${failed.error}`
        : `${origin}→${dest}${via ? ` via ${via}` : ''}${avoid.length ? ` avoid ${avoid.join('/')}` : ''}` +
            ` @ ${formatTime(time)} · ≤${maxTransfers} chg · ${total.toFixed(1)} ms`,
    );
  }, [feed, stations]);

  // Re-run whenever a picker or the planner selection changes. Free-text fields wait for Enter or
  // the run button.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these are the inputs that auto-run
  useEffect(() => {
    void run();
  }, [run, query.planners, query.num, query.maxTransfers, query.date, query.time]);

  // 1–9 toggle planners, unless a field has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!/^[1-9]$/.test(e.key)) return;
      if (document.activeElement?.tagName === 'INPUT') return;
      const planner = feed.planners[Number(e.key) - 1];
      if (planner) dispatch({ type: 'togglePlanner', id: planner.id });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [feed.planners]);

  const selected = useMemo(() => {
    if (!selection) return null;
    const result = results.find((r) => r.planner.id === selection.planner);
    if (!result) return null;
    const journey = result.journeys[selection.index] ?? result.journeys[0];
    return journey ? { result, journey } : null;
  }, [results, selection]);

  const toggleLeg = useCallback((key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  return (
    <StationsProvider value={stations}>
      <div id="app">
        <Header
          feed={feed}
          status={status}
          mapSize={mapSize}
          theme={theme}
          onCycleMap={onCycleMap}
          onToggleTheme={onToggleTheme}
        />
        <div className="shell">
          <Sidebar query={query} planners={feed.planners} dispatch={dispatch} onRun={run} />
          <main>
            <Columns
              results={results}
              selection={selection}
              expanded={expanded}
              onSelect={setSelection}
              onToggleLeg={toggleLeg}
            />
            <MapPane
              journey={selected?.journey ?? null}
              caption={selected ? mapCaption(selected.result.planner.name, selected.journey) : null}
              theme={theme}
            />
          </main>
        </div>
      </div>
    </StationsProvider>
  );
}
