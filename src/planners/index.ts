import { PATTERN_DIRECTORY_URL, PATTERN_FILE_URL } from '../feed/source';
import type { FeedIndex } from '../feed/types';
import { RaptorJourneyPlanner } from './RaptorJourneyPlanner';
import { TransferPatternPlanner } from './TransferPatternPlanner';
import type { Planner, PlannerQuery, PlannerResult, Threaded } from './types';

/**
 * Every planner under comparison.
 *
 * Each holds a worker and a timetable of its own, so they are built once and kept. Another package
 * plugs in by implementing Planner and being added to this list.
 *
 * The two transfer-pattern planners are the same algorithm reading the same patterns, and differ
 * only in when those are fetched: the whole set up front, or a station at a time as a query asks
 * for one. That trade is what putting them side by side is for.
 */
export const createPlanners = (): Planner[] => [
  new RaptorJourneyPlanner(),
  new TransferPatternPlanner({
    id: 'tp-eager',
    name: 'Transfer patterns',
    sub: 'eager — whole set held',
    hue: 300,
    patterns: { kind: 'eager', url: PATTERN_FILE_URL },
  }),
  new TransferPatternPlanner({
    id: 'tp-lazy',
    name: 'Transfer patterns',
    sub: 'lazy — a station at a time',
    hue: 190,
    patterns: { kind: 'lazy', base: PATTERN_DIRECTORY_URL },
  }),
];

export const isThreaded = (planner: Planner): planner is Planner & Threaded =>
  'setThreads' in planner;

/**
 * Thread counts the workbench offers, before the machine's core count trims them.
 *
 * Powers of two rather than every number: the point is to see whether spreading the searches does
 * anything at all, and a worker costs a timetable, so the interesting steps are far apart.
 */
export const THREAD_CHOICES = [1, 2, 4, 8] as const;

/**
 * The counts worth offering on this machine.
 *
 * More workers than cores would be threads taking turns on the same core, which is slower than
 * asking for fewer and says nothing about the algorithm.
 */
export function threadChoices(cores = navigator.hardwareConcurrency || 1): number[] {
  return THREAD_CHOICES.filter((count) => count === 1 || count <= cores);
}

/**
 * Put the same question to every planner and time each answer.
 *
 * They run one after another rather than at once: they are all waiting on workers competing for
 * the same cores, and a wall clock measured under that contention would say more about the machine
 * than about the algorithm.
 */
export async function runComparison(
  planners: readonly Planner[],
  query: PlannerQuery,
  feed: FeedIndex,
): Promise<PlannerResult[]> {
  const results: PlannerResult[] = [];

  for (const planner of planners) {
    const started = performance.now();
    try {
      const run = await planner.plan(query, feed);
      results.push({ planner, ms: performance.now() - started, ...run });
    } catch (e) {
      results.push({
        planner,
        ms: performance.now() - started,
        journeys: [],
        queries: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}

export type * from './types';
export { RaptorJourneyPlanner };
