import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Overlay } from '@/components/Overlay';
import { Select } from '@/components/Field';
import { CADENCE } from '@/domain/cadence';
import { DAYS, formatMins, hhmm } from '@/domain/time';
import type { Chore, PersonId, PlanEntry } from '@/domain/types';
import { useWeek } from '@/hooks/useWeek';
import { useHousehold } from '@/store/household';
import { useProperty } from '@/store/property';
import { choreById, roomNameIn } from '@/store/selectors';
import { useUi } from '@/store/ui';
import styles from './TaskDetail.module.css';
import { nearestOffered, TIMES } from './times';

export function TaskDetail() {
  const taskSheet = useUi((s) => s.taskSheet);
  const setTaskSheet = useUi((s) => s.setTaskSheet);
  const state = useHousehold((s) => s.state);
  const week = useWeek();

  const entry = taskSheet ? week.week.plan.find((e) => e.key === taskSheet) : undefined;
  const chore = entry ? choreById(state, entry.choreId) : undefined;
  const open = entry != null && chore != null;

  return (
    <Overlay open={open} title={chore?.name ?? ''} onClose={() => setTaskSheet(null)}>
      {open && (
        // Keyed on the occurrence so the form re-initialises for a new job
        // rather than being synchronised by an effect.
        <TaskForm
          key={entry.key}
          entry={entry}
          chore={chore}
          weekKey={week.key}
          done={week.done.has(entry.key)}
        />
      )}
    </Overlay>
  );
}

interface FormProps {
  entry: PlanEntry;
  chore: Chore;
  weekKey: string;
  done: boolean;
}

function TaskForm({ entry, chore, weekKey, done }: FormProps) {
  const state = useHousehold((s) => s.state);
  const { toggleDone, place, skip, unskip, automate } = useHousehold();
  const { setTaskSheet, setTab, openRoomDetail } = useUi();
  const plan = useProperty((s) => s.plan);
  const overrides = useHousehold((s) => s.state.weeks[weekKey]?.overrides ?? {});

  const [person, setPerson] = useState<PersonId | null>(
    () => entry.personId ?? state.people[0]?.id ?? null,
  );
  const [day, setDay] = useState(() => entry.day);
  const [at, setAt] = useState(() => nearestOffered(entry.at ?? 19 * 60));

  const close = () => setTaskSheet(null);
  const overridden = overrides[entry.key] != null;

  const status = entry.skipped
    ? 'skipped'
    : entry.personId
      ? overridden
        ? 'placed by hand'
        : null
      : "didn't fit";

  return (
    <>
      <p className={styles.meta}>
        <button
          className={styles.roomLink}
          onClick={() => {
            if (chore.roomId) {
              openRoomDetail(chore.roomId);
              setTab('rooms');
            }
            close();
          }}
        >
          {roomNameIn(plan, chore.roomId)}
        </button>
        {' · '}
        {formatMins(entry.mins)} · {CADENCE[chore.cadence].label}
        {status ? ` · ${status}` : ''}
        {entry.at != null ? ` · ${DAYS[entry.day]} ${hhmm(entry.at)}` : ''}
      </p>

      <div className={styles.row}>
        <Button variant="primary" onClick={() => toggleDone(weekKey, entry.key)}>
          {done ? 'Done ✓' : 'Mark done'}
        </Button>
        {entry.skipped ? (
          <Button onClick={() => unskip(weekKey, entry.key)}>Put it back</Button>
        ) : (
          <Button onClick={() => skip(weekKey, entry.key)}>Skip this week</Button>
        )}
      </div>

      {!entry.skipped && (
        <Card title="Place it">
          <div className={styles.place}>
            <div>
              <span className={styles.label}>Who</span>
              <div className={styles.row}>
                {state.people.map((candidate) => (
                  <Button
                    key={candidate.id}
                    aria-pressed={person === candidate.id}
                    style={
                      person === candidate.id
                        ? {
                            background: candidate.colour,
                            borderColor: candidate.colour,
                            color: 'var(--on-signal)',
                          }
                        : undefined
                    }
                    onClick={() => setPerson(candidate.id)}
                  >
                    {candidate.name}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <span className={styles.label}>Day</span>
              <div className={styles.days}>
                {DAYS.map((name, index) => (
                  <Button
                    key={name}
                    size="sm"
                    aria-pressed={day === index}
                    onClick={() => setDay(index)}
                  >
                    {name.slice(0, 2)}
                  </Button>
                ))}
              </div>
            </div>

            <div className={styles.apply}>
              <div>
                <span className={styles.label}>Time</span>
                <Select value={at} onChange={(e) => setAt(Number(e.target.value))}>
                  {TIMES.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {hhmm(minutes)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="primary"
                disabled={!person}
                onClick={() => {
                  if (!person) return;
                  place(weekKey, entry.key, { personId: person, day, at });
                  close();
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </Card>
      )}

      {overridden && !entry.skipped && (
        <Button
          full
          onClick={() => {
            automate(weekKey, entry.key);
            close();
          }}
        >
          Let the planner decide again
        </Button>
      )}
    </>
  );
}
