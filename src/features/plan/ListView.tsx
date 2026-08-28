import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Meter } from '@/components/Meter';
import { DAYS, dayIndexOf, formatMins } from '@/domain/time';
import type { PlanEntry } from '@/domain/types';
import { useHousehold } from '@/store/household';
import { choreById } from '@/store/selectors';
import { useUi } from '@/store/ui';
import type { useWeek } from '@/hooks/useWeek';
import styles from './ListView.module.css';
import { TaskRow } from './TaskRow';

type Week = ReturnType<typeof useWeek>;

export function ListView({ week }: { week: Week }) {
  const state = useHousehold((s) => s.state);
  const toggleDone = useHousehold((s) => s.toggleDone);
  const reshuffle = useHousehold((s) => s.reshuffle);
  const { whoFilter, hideDone, setWhoFilter, toggleHideDone, setTaskSheet } = useUi();

  const today = dayIndexOf(new Date());
  const unplaced = week.week.plan.filter((e) => !e.skipped && !e.personId);
  const skipped = week.week.plan.filter((e) => e.skipped);

  const open = (key: string) => setTaskSheet(key);
  const toggle = (key: string) => toggleDone(week.key, key);

  const visible = (entry: PlanEntry) =>
    entry.personId &&
    !entry.skipped &&
    (whoFilter === 'all' || entry.personId === whoFilter) &&
    !(hideDone && week.done.has(entry.key));

  const days = DAYS.map((_, day) => {
    const items = week.week.plan.filter((e) => e.day === day && visible(e));
    items.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    return { day, items };
  }).filter((d) => d.items.length > 0);

  return (
    <>
      <div className={styles.filters}>
        <Button size="sm" aria-pressed={whoFilter === 'all'} onClick={() => setWhoFilter('all')}>
          Both
        </Button>
        {state.people.map((person) => (
          <Button
            key={person.id}
            size="sm"
            aria-pressed={whoFilter === person.id}
            onClick={() => setWhoFilter(person.id)}
          >
            {person.name}
          </Button>
        ))}
        <Button
          size="sm"
          className={styles.hideDone}
          aria-pressed={hideDone}
          onClick={toggleHideDone}
        >
          {hideDone ? 'Hiding done' : 'Hide done'}
        </Button>
      </div>

      <Card>
        <div className={styles.people}>
          {state.people.map((person, index) => {
            const assigned = week.totals.byPerson[person.id] ?? 0;
            const free = week.week.meta.free[index] ?? 0;
            const doneMins = week.week.plan.reduce(
              (sum, e) =>
                e.personId === person.id && !e.skipped && week.done.has(e.key) ? sum + e.mins : sum,
              0,
            );
            const share = free ? assigned / free : 0;
            return (
              <Meter
                key={person.id}
                name={person.name}
                nameColour={person.colour}
                value={`${formatMins(doneMins)} of ${formatMins(assigned)} · ${Math.round(share * 100)}% of free`}
                fraction={share}
                colour={person.colour}
                tall
              />
            );
          })}
        </div>
      </Card>

      {unplaced.length > 0 && (
        <Card accent title={`${unplaced.length} didn't fit`} aside="tap to place">
          {unplaced.map((entry) => (
            <button key={entry.key} className={styles.stub} onClick={() => open(entry.key)}>
              <span>{choreById(state, entry.choreId)?.name}</span>
              <span>{formatMins(entry.mins)}</span>
            </button>
          ))}
        </Card>
      )}

      {days.length === 0 && (
        <p className={styles.empty}>
          Nothing to show.
          <br />
          {hideDone ? 'Everything here is done.' : 'Try a different filter.'}
        </p>
      )}

      {days.map(({ day, items }) => (
        <div key={day} className={`${styles.day} ${day === today ? styles.today : ''}`}>
          <h3 className={styles.dayHead}>
            <span>
              {DAYS[day]}
              {day === today ? ' · today' : ''}
            </span>
            <span>{formatMins(items.reduce((s, e) => s + e.mins, 0))}</span>
          </h3>
          {items.map((entry) => (
            <TaskRow
              key={entry.key}
              entry={entry}
              done={week.done.has(entry.key)}
              onOpen={open}
              onToggle={toggle}
            />
          ))}
        </div>
      ))}

      {skipped.length > 0 && (
        <Card title="Skipped this week">
          {skipped.map((entry) => (
            <button
              key={entry.key}
              className={`${styles.stub} ${styles.faded}`}
              onClick={() => open(entry.key)}
            >
              <span>{choreById(state, entry.choreId)?.name}</span>
              <span>{formatMins(entry.mins)}</span>
            </button>
          ))}
        </Card>
      )}

      <Button full onClick={() => reshuffle(week.key)}>
        Reshuffle the week
      </Button>
    </>
  );
}
