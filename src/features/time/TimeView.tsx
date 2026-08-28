import { useRef } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PRESETS } from '@/data/defaultAvailability';
import { freeMinutes } from '@/domain/scheduler';
import { DAYS, HOURS, formatMins } from '@/domain/time';
import type { PersonId } from '@/domain/types';
import { useHousehold } from '@/store/household';
import styles from './TimeView.module.css';

export function TimeView() {
  const state = useHousehold((s) => s.state);
  const setAvailability = useHousehold((s) => s.setAvailability);
  const applyPreset = useHousehold((s) => s.applyPreset);

  // Painting mutates a working copy and commits once, so a drag across
  // forty cells is one store write rather than forty.
  const painting = useRef<{ personId: PersonId; value: boolean; grid: boolean[][] } | null>(null);

  function cellAt(x: number, y: number): HTMLElement | null {
    const element = document.elementFromPoint(x, y);
    return element instanceof HTMLElement && element.dataset['cell'] ? element : null;
  }

  function paint(element: HTMLElement) {
    const session = painting.current;
    if (!session) return;
    const [personId, d, h] = element.dataset['cell']!.split(':');
    if (personId !== session.personId) return;
    const day = Number(d);
    const hour = Number(h);
    if (session.grid[day]?.[hour] === session.value) return;
    session.grid[day]![hour] = session.value;
    element.classList.toggle(styles.on!, session.value);
  }

  return (
    <>
      {state.people.map((person) => {
        const grid = state.availability[person.id] ?? [];
        return (
          <Card
            key={person.id}
            title={<span style={{ color: person.colour }}>{person.name}</span>}
            aside={`${formatMins(freeMinutes(grid))} free`}
          >
            <div
              className={styles.grid}
              style={{ ['--fill' as string]: person.colour }}
              onPointerDown={(event) => {
                const element = cellAt(event.clientX, event.clientY);
                if (!element) return;
                event.preventDefault();
                const [, d, h] = element.dataset['cell']!.split(':');
                painting.current = {
                  personId: person.id,
                  value: !grid[Number(d)]?.[Number(h)],
                  grid: grid.map((row) => [...row]),
                };
                paint(element);
                // Capture keeps the drag alive when the finger leaves the
                // grid. It throws if the pointer has already gone, which must
                // not abandon the paint that has just started.
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  /* the drag still works, it just stops at the grid's edge */
                }
              }}
              onPointerMove={(event) => {
                if (!painting.current) return;
                const element = cellAt(event.clientX, event.clientY);
                if (element) paint(element);
              }}
              onPointerUp={() => {
                const session = painting.current;
                painting.current = null;
                if (session) setAvailability(session.personId, session.grid);
              }}
              onPointerCancel={() => (painting.current = null)}
            >
              <span />
              {DAYS.map((day, dayIndex) => (
                <button
                  key={day}
                  className={styles.colHead}
                  onClick={() => {
                    const anyOn = grid[dayIndex]?.some(Boolean) ?? false;
                    const next = grid.map((row, d) =>
                      d === dayIndex ? row.map(() => !anyOn) : [...row],
                    );
                    setAvailability(person.id, next);
                  }}
                >
                  {day}
                </button>
              ))}
              {HOURS.map((hour, hourIndex) => (
                <ReactFragmentRow
                  key={hour}
                  hour={hour}
                  hourIndex={hourIndex}
                  personId={person.id}
                  grid={grid}
                  onFlipRow={() => {
                    const anyOn = grid.some((row) => row[hourIndex]);
                    const next = grid.map((row) =>
                      row.map((on, h) => (h === hourIndex ? !anyOn : on)),
                    );
                    setAvailability(person.id, next);
                  }}
                />
              ))}
            </div>

            <div className={styles.presets}>
              <Button size="sm" onClick={() => applyPreset(person.id, PRESETS.weekdayEvenings)}>
                + Weekday eves
              </Button>
              <Button size="sm" onClick={() => applyPreset(person.id, PRESETS.weekends)}>
                + Weekends
              </Button>
              <Button size="sm" onClick={() => applyPreset(person.id, null)}>
                Clear
              </Button>
            </div>
          </Card>
        );
      })}

      <Card>
        <p className={styles.note}>
          Drag to paint the hours you could do jobs in. Tap a day name or an hour to flip a whole
          row or column. Marking an hour doesn&rsquo;t mean you&rsquo;ll spend it cleaning — at most{' '}
          <b>{formatMins(state.settings.dailyCap)}</b> of work goes into any one day, and nothing is
          scheduled before 07:00 or after 22:30. The totals only set the ratio between you.
        </p>
      </Card>
    </>
  );
}

/** One hour row: the clock label plus seven cells. */
function ReactFragmentRow({
  hour,
  hourIndex,
  personId,
  grid,
  onFlipRow,
}: {
  hour: number;
  hourIndex: number;
  personId: PersonId;
  grid: boolean[][];
  onFlipRow(): void;
}) {
  return (
    <>
      <button className={styles.rowHead} onClick={onFlipRow}>
        {hour}
      </button>
      {DAYS.map((day, dayIndex) => (
        <div
          key={day}
          data-cell={`${personId}:${dayIndex}:${hourIndex}`}
          className={`${styles.cell} ${grid[dayIndex]?.[hourIndex] ? styles.on : ''}`}
          role="checkbox"
          aria-checked={grid[dayIndex]?.[hourIndex] ?? false}
          aria-label={`${day} ${hour}:00`}
          tabIndex={-1}
        />
      ))}
    </>
  );
}
