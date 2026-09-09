import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { FeedSession } from '../feed/feed';
import { createStations, type Stations, StationsProvider } from '../feed/stations';
import type { PlaceCode } from '../feed/types';
import { formatTime, parseDate, parseTime } from '../journey/time';
import { isThreaded, runComparison, threadChoices } from '../planners';
import type { Planner, PlannerResult, Threaded } from '../planners/types';
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

/**
 * How a side of the query reads in the summary line.
 *
 * The places as they were asked for, not what they expanded to: `London Terminals` says what was
 * meant, where the eighteen station codes behind it would fill the line and say less.
 */
const places = (stations: Stations, codes: readonly PlaceCode[]): string =>
  codes.map(stations.short).join('/');

export function Workbench({ feed, theme, mapSize, onCycleMap, onToggleTheme }: WorkbenchProps) {
  const stations = useMemo(
    () => createStations(feed.index, feed.groups),
    [feed.index, feed.groups],
  );
  const [query, dispatch] = useReducer(
    queryReducer,
    { index: feed.index, planners: feed.planners },
    initialQuery,
  );
  const [results, setResults] = useState<PlannerResult[]>([]);
  const [status, setStatus] = useState('no query');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const threaded = useMemo(() => feed.planners.filter(isThreaded), [feed.planners]);
  const choices = useMemo(() => threadChoices(), []);
  const [threads, setThreads] = useState<ReadonlyMap<string, number>>(
    () => new Map(threaded.map((planner) => [planner.id, planner.threads])),
  );

  // A planner rebuilding its workers has none to ask, and a clock started before it finished would
  // be timing the rebuild, so runs are held off rather than queued behind it.
  const [rebuilding, setRebuilding] = useState(false);
  const busy = useRef(false);

  // The reducer state is read inside `run`, but `run` must stay stable for the keyboard handler,
  // so read it through a ref rather than a dependency.
  const latest = useRef<QueryState>(query);
  latest.current = query;

  // Planning is asynchronous now that it happens in a worker, so an answer that arrives after a
  // later question was asked is dropped rather than shown.
  const generation = useRef(0);

  const run = useCallback(async () => {
    if (busy.current) return;
    const current = latest.current;

    // The places as typed — a station, or a group like London Terminals — and then the stations
    // they stand for, which is what a planner is asked about. Both are kept: the summary line reads
    // better naming the group than listing the eighteen stations it turned into.
    const from = toCodes(current.origin, stations.first);
    const to = toCodes(current.dest, stations.first);
    const origins = stations.expand(from);
    // A station on both sides is a journey of no distance, which would beat every real one. Dropped
    // from the destinations rather than refused, so London Terminals → Reading still plans.
    const destinations = stations.expand(to).filter((code) => !origins.includes(code));

    if (origins.length === 0 || destinations.length === 0) {
      setStatus('pick two different stations');
      return;
    }

    const date = parseDate(current.date);
    if (!date) {
      setStatus('unreadable date');
      return;
    }

    const time = parseTime(current.time) ?? 480;
    const viaPlace = current.via.trim() ? toCode(current.via, stations.first) : null;
    const via = viaPlace ? stations.expand([viaPlace]) : [];
    const avoid = stations
      .expand(toCodes(current.avoid, stations.first))
      .filter((c) => !origins.includes(c) && !destinations.includes(c));
    const num = Math.max(1, Math.min(10, current.num || 4));
    const maxTransfers = Math.max(0, Math.min(10, current.maxTransfers || 0));
    const planners = feed.planners.filter((planner) => current.planners.includes(planner.id));

    const mine = ++generation.current;
    setStatus('planning…');

    const next = await runComparison(
      planners,
      {
        origins,
        destinations,
        date,
        time,
        via,
        avoid,
        num,
        maxTransfers,
      },
      feed.index,
    );
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
        : `${places(stations, from)}→${places(stations, to)}` +
            `${viaPlace ? ` via ${stations.short(viaPlace)}` : ''}` +
            `${avoid.length ? ` avoid ${avoid.join('/')}` : ''}` +
            ` @ ${formatTime(time)} · ≤${maxTransfers} chg · ${total.toFixed(1)} ms`,
    );
  }, [feed, stations]);

  /**
   * Give a planner a different number of workers, then ask the same question again so the change
   * can be read off the clock.
   */
  const changeThreads = useCallback(
    async (planner: Planner & Threaded, count: number) => {
      if (planner.threads === count) return;
      busy.current = true;
      setRebuilding(true);
      setStatus(`${planner.name}: building ${count} worker${count === 1 ? '' : 's'}…`);

      try {
        await planner.setThreads(count, (progress) =>
          setStatus(
            `${planner.name}: ${progress.phase} ${progress.entry ?? ''} · ${progress.rows.toLocaleString()} rows`,
          ),
        );
        setThreads((previous) => new Map(previous).set(planner.id, count));
      } catch (e) {
        // The planner is left without workers, and says so when asked; clicking a count again
        // rebuilds it.
        setStatus(`${planner.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        busy.current = false;
        setRebuilding(false);
      }

      void run();
    },
    [run],
  );

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
          <Sidebar
            query={query}
            planners={feed.planners}
            unavailable={feed.unavailable}
            threaded={threaded}
            threads={threads}
            choices={choices}
            rebuilding={rebuilding}
            dispatch={dispatch}
            onRun={run}
            onThreads={changeThreads}
          />
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
