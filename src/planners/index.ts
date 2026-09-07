import { RaptorJourneyPlanner } from './RaptorJourneyPlanner';
import type { Planner, PlannerQuery, PlannerResult } from './types';

/**
 * Every planner under comparison.
 *
 * Each holds a worker and a timetable of its own, so they are built once and kept. Another package
 * plugs in by implementing Planner and being added to this list.
 */
export const createPlanners = (): Planner[] => [new RaptorJourneyPlanner()];

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
): Promise<PlannerResult[]> {
  const results: PlannerResult[] = [];

  for (const planner of planners) {
    const started = performance.now();
    try {
      const run = await planner.plan(query);
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
