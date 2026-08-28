import { useState } from 'react';
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
  const { whoFilter, hideDone, setWhoFilter, toggleHideDone, setTaskSheet, setTab } = useUi();

  // Reshuffling throws away every hand placement, skip and pin for the week,
  // so it asks first — and only makes a fuss when there is something to lose.
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const overrides = Object.keys(state.weeks[week.key]?.overrides ?? {}).length;

  const today = dayIndexOf(new Date());
  const totalFree = week.week.meta.free.reduce((sum, f) => sum + f, 0);
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

      {totalFree === 0 && (
        <Card accent title="No hours to work with">
          <p className={styles.hint}>
            Nothing can be scheduled until someone says when they&rsquo;re free, so every job below
            is waiting. Paint a few hours under Time and the week fills itself in.
          </p>
          <div style={{ marginTop: 'var(--s3)' }}>
            <Button size="sm" onClick={() => setTab('time')}>
              Go to Time
            </Button>
          </div>
        </Card>
      )}

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

      {confirmShuffle ? (
        <Card accent title="Reshuffle the week?">
          <p className={styles.hint}>
            This hands the whole week back to the planner. The {overrides} change
            {overrides === 1 ? '' : 's'} you made by hand — placements, skips and pins — will be
            undone, and it can&rsquo;t be taken back.
          </p>
          <div className={styles.confirm}>
            <Button
              variant="danger"
              onClick={() => {
                reshuffle(week.key);
                setConfirmShuffle(false);
              }}
            >
              Reshuffle
            </Button>
            <Button onClick={() => setConfirmShuffle(false)}>Keep it as it is</Button>
          </div>
        </Card>
      ) : (
        <Button full onClick={() => (overrides ? setConfirmShuffle(true) : reshuffle(week.key))}>
          Reshuffle the week
        </Button>
      )}
    </>
  );
}
