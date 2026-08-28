import { useMemo } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DAYS, dayIndexOf, formatMins, hhmm, localISO, weekKey } from '@/domain/time';
import type { PlanEntry } from '@/domain/types';
import { useHousehold } from '@/store/household';
import { choreById, personById } from '@/store/selectors';
import { useUi } from '@/store/ui';
import styles from './MonthGrid.module.css';

interface DayInfo {
  items: PlanEntry[];
  byPerson: Record<string, number>;
  total: number;
  isForecast: boolean;
}

export function MonthGrid() {
  const state = useHousehold((s) => s.state);
  const preview = useHousehold((s) => s.preview);
  const { monthCursor, monthSelection, setMonthCursor, setMonthSelection, setTaskSheet } = useUi();

  const cursor = useMemo(() => {
    if (monthCursor) return new Date(`${monthCursor}T12:00:00`);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 12);
  }, [monthCursor]);

  const thisWeekKey = weekKey(new Date());
  const todayISO = localISO(new Date());

  const { cells, dayInfo, busiest } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1, 12);
    const pad = dayIndexOf(first);
    const count = new Date(year, month + 1, 0).getDate();

    const weekCache = new Map<string, { plan: PlanEntry[]; isForecast: boolean }>();
    const info: Record<string, DayInfo> = {};
    let most = 1;

    for (let d = 1; d <= count; d++) {
      const date = new Date(year, month, d, 12);
      const iso = localISO(date);
      const wk = weekKey(date);

      if (!weekCache.has(wk)) {
        const stored = state.weeks[wk];
        weekCache.set(
          wk,
          stored
            ? { plan: stored.plan, isForecast: false }
            : { plan: preview(wk).plan, isForecast: true },
        );
      }
      const { plan, isForecast } = weekCache.get(wk)!;
      const items = plan.filter((e) => e.day === dayIndexOf(date) && !e.skipped && e.personId);
      const byPerson: Record<string, number> = {};
      let total = 0;
      for (const entry of items) {
        if (!entry.personId) continue;
        byPerson[entry.personId] = (byPerson[entry.personId] ?? 0) + entry.mins;
        total += entry.mins;
      }
      most = Math.max(most, total);
      info[iso] = { items, byPerson, total, isForecast };
    }

    return { cells: { pad, count, year, month }, dayInfo: info, busiest: most };
  }, [cursor, state.weeks, preview]);

  const title = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const step = (delta: number) =>
    setMonthCursor(localISO(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)));

  const selected = monthSelection ? dayInfo[monthSelection] : undefined;

  return (
    <>
      <div className={styles.nav}>
        <Button size="sm" iconOnly onClick={() => step(-1)} aria-label="Previous month">
          ‹
        </Button>
        <h3>{title}</h3>
        <Button size="sm" iconOnly onClick={() => step(1)} aria-label="Next month">
          ›
        </Button>
      </div>

      <div className={styles.grid}>
        {DAYS.map((d) => (
          <span key={d} className={styles.head}>
            {d.slice(0, 2)}
          </span>
        ))}
        {Array.from({ length: cells.pad }, (_, i) => (
          <span key={`pad${i}`} className={`${styles.cell} ${styles.pad}`} />
        ))}
        {Array.from({ length: cells.count }, (_, i) => {
          const iso = localISO(new Date(cells.year, cells.month, i + 1, 12));
          const info = dayInfo[iso]!;
          return (
            <button
              key={iso}
              className={[
                styles.cell,
                iso === todayISO ? styles.isToday : '',
                monthSelection === iso ? styles.selected : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMonthSelection(monthSelection === iso ? null : iso)}
            >
              <b>{i + 1}</b>
              {state.people.map((person) => (
                <i
                  key={person.id}
                  style={{
                    width: `${Math.round((88 * (info.byPerson[person.id] ?? 0)) / busiest)}%`,
                    background: person.colour,
                  }}
                />
              ))}
              <small>{info.total ? formatMins(info.total) : ''}</small>
            </button>
          );
        })}
      </div>

      {monthSelection && selected && (
        <Card
          title={new Date(`${monthSelection}T12:00:00`).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })}
          aside={selected.isForecast ? 'forecast' : undefined}
        >
          {selected.items.length === 0 ? (
            <p className={styles.note}>Nothing lands here.</p>
          ) : (
            [...selected.items]
              .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
              .map((entry) => {
                const chore = choreById(state, entry.choreId);
                const person = personById(state, entry.personId);
                const live = weekKey(new Date(`${monthSelection}T12:00:00`)) === thisWeekKey;
                return (
                  <button
                    key={entry.key}
                    className={styles.detail}
                    disabled={!live}
                    onClick={() => live && setTaskSheet(entry.key)}
                  >
                    <span className={styles.dot} style={{ background: person?.colour }} />
                    <span className={styles.body}>
                      <span>{chore?.name}</span>
                      <small>
                        {entry.at != null ? `${hhmm(entry.at)} · ` : ''}
                        {person?.name} · {formatMins(entry.mins)}
                      </small>
                    </span>
                  </button>
                );
              })
          )}
          {selected.isForecast && (
            <p className={styles.note}>
              Other weeks are a forecast. The live plan is set week by week, so it shifts as the
              running total moves.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
