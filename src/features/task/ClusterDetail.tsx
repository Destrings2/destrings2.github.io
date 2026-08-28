import { Overlay } from '@/components/Overlay';
import { hhmm } from '@/domain/time';
import { useWeek } from '@/hooks/useWeek';
import { useHousehold } from '@/store/household';
import { useUi } from '@/store/ui';
import { TaskRow } from '@/features/plan/TaskRow';

/**
 * The jobs behind a merged timeline block. A run of five-minute jobs is real
 * work, it just can't be drawn to scale — so it gets a list instead.
 */
export function ClusterDetail() {
  const { clusterSheet, setClusterSheet, setTaskSheet } = useUi();
  const toggleDone = useHousehold((s) => s.toggleDone);
  const week = useWeek();

  const entries = (clusterSheet ?? [])
    .map((key) => week.week.plan.find((e) => e.key === key))
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  const open = clusterSheet != null && entries.length > 0;
  const from = entries[0]?.at ?? 0;
  const last = entries[entries.length - 1];
  const to = (last?.at ?? 0) + (last?.mins ?? 0);

  return (
    <Overlay
      open={open}
      title={open ? `${entries.length} quick jobs` : ''}
      onClose={() => setClusterSheet(null)}
    >
      {open && (
        <>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-xs)',
              color: 'var(--text-2)',
            }}
          >
            {hhmm(from)}–{hhmm(to)}
          </p>
          {entries.map((entry) => (
            <TaskRow
              key={entry.key}
              entry={entry}
              done={week.done.has(entry.key)}
              onOpen={(key) => setTaskSheet(key)}
              onToggle={(key) => toggleDone(week.key, key)}
            />
          ))}
        </>
      )}
    </Overlay>
  );
}
