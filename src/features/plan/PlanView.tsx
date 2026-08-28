import { Segmented } from '@/components/Segmented';
import { useWeek } from '@/hooks/useWeek';
import { useUi, type PlanView as PlanViewMode } from '@/store/ui';
import { DayTimeline } from './DayTimeline';
import { ListView } from './ListView';
import { MonthGrid } from './MonthGrid';

const VIEWS = [
  { value: 'list', label: 'List' },
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
] as const satisfies readonly { value: PlanViewMode; label: string }[];

export function PlanView() {
  const week = useWeek();
  const { planView, setPlanView } = useUi();

  return (
    <>
      <Segmented options={VIEWS} value={planView} onChange={setPlanView} label="Plan view" />
      {planView === 'list' && <ListView week={week} />}
      {planView === 'day' && <DayTimeline week={week} />}
      {planView === 'month' && <MonthGrid />}
    </>
  );
}
