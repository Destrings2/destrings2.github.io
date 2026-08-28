import { useMemo } from 'react';
import { roomLoad, weekTotals } from '@/domain/totals';
import { useHousehold } from '@/store/household';
import { WHOLE_HOME } from '@/store/selectors';

/**
 * This week, plus everything derived from it. One place so the scene, the
 * header and the list can't disagree about what is left.
 */
export function useWeek() {
  const state = useHousehold((s) => s.state);
  const currentWeek = useHousehold((s) => s.currentWeek);
  const { key, week } = currentWeek();

  return useMemo(() => {
    const done = new Set(week.done);
    const plan = { plan: week.plan, meta: week.meta };
    return {
      key,
      week,
      done,
      totals: weekTotals(plan, done),
      load: roomLoad(plan, state.chores, done, WHOLE_HOME),
    };
  }, [key, week, state.chores]);
}
