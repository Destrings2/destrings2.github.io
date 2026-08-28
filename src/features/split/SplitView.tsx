import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { averageWeekly } from '@/domain/totals';
import { formatMins } from '@/domain/time';
import { useWeek } from '@/hooks/useWeek';
import { Meter } from '@/components/Meter';
import { useHousehold } from '@/store/household';
import { PeopleCard } from './PeopleCard';
import styles from './SplitView.module.css';

export function SplitView() {
  const state = useHousehold((s) => s.state);
  const { resetLedger } = useHousehold();
  const week = useWeek();

  const free = week.week.meta.free;
  const totalFree = free.reduce((s, f) => s + f, 0);
  const ledgerTotal = state.people.reduce((s, p) => s + (state.ledger[p.id] ?? 0), 0) || 1;

  const givenUp = state.people.map((person, i) => {
    const assigned = week.totals.byPerson[person.id] ?? 0;
    const own = free[i] ?? 0;
    return { name: person.name, pct: own ? Math.round((assigned / own) * 100) : 0 };
  });

  return (
    <>
      <Card title="This week">
        <div className={styles.kv}>
          <span>Jobs due</span>
          <span>
            {week.totals.count} · {formatMins(week.totals.total)}
          </span>
        </div>
        <div className={styles.kv}>
          <span>Long-run average</span>
          <span>{formatMins(Math.round(averageWeekly(state.chores)))} a week</span>
        </div>
        {state.people.map((person, index) => (
          <div key={person.id} className={styles.kv}>
            <span style={{ color: person.colour }}>{person.name}</span>
            <span>
              {Math.round((week.week.meta.share[index] ?? 0) * 100)}% of the free time →{' '}
              {formatMins(week.totals.byPerson[person.id] ?? 0)}
            </span>
          </div>
        ))}
        <p className={styles.note}>
          {totalFree ? (
            <>
              {givenUp.length === 1 ? (
                <>
                  You give up <b>{givenUp[0]!.pct}%</b> of your own free time.
                </>
              ) : (
                <>
                  You each give up{' '}
                  {givenUp.map((entry, i) => (
                    <span key={entry.name}>
                      {i > 0 && (i === givenUp.length - 1 ? ' and ' : ', ')}
                      <b>{entry.pct}%</b>
                      {givenUp.length > 2 ? ` (${entry.name})` : ''}
                    </span>
                  ))}{' '}
                  of your own free time. Those being equal is what fair means here.
                </>
              )}
            </>
          ) : (
            'Add some free time under Time first.'
          )}
        </p>
      </Card>

      <Card title="Running total">
        <p className={styles.note} style={{ marginTop: 0, marginBottom: 'var(--s3)' }}>
          Minutes actually ticked off, all time. If one of you falls behind, next week leans the
          other way to even it out.
        </p>
        <div className={styles.stack}>
          {state.people.map((person) => {
            const mins = state.ledger[person.id] ?? 0;
            return (
              <Meter
                key={person.id}
                name={person.name}
                nameColour={person.colour}
                value={`${formatMins(mins)} · ${Math.round((mins / ledgerTotal) * 100)}%`}
                fraction={mins / ledgerTotal}
                colour={person.colour}
              />
            );
          })}
        </div>
        <div style={{ marginTop: 'var(--s3)' }}>
          <Button size="sm" onClick={resetLedger}>
            Reset running total
          </Button>
        </div>
      </Card>

      <PeopleCard />
    </>
  );
}
