import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field, Range, TextInput } from '@/components/Field';
import { averageWeekly } from '@/domain/totals';
import { formatMins } from '@/domain/time';
import { useWeek } from '@/hooks/useWeek';
import { Meter } from '@/components/Meter';
import { useHousehold } from '@/store/household';
import styles from './SplitView.module.css';

export function SplitView() {
  const state = useHousehold((s) => s.state);
  const { setDailyCap, resetLedger, resetAll, renamePeople } = useHousehold();
  const week = useWeek();

  const [names, setNames] = useState(() => state.people.map((p) => p.name));
  const [confirming, setConfirming] = useState(false);

  const free = week.week.meta.free;
  const totalFree = free.reduce((s, f) => s + f, 0);
  const ledgerTotal = state.people.reduce((s, p) => s + (state.ledger[p.id] ?? 0), 0) || 1;

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
              You each give up{' '}
              <b>
                {state.people
                  .map((person, i) => {
                    const assigned = week.totals.byPerson[person.id] ?? 0;
                    const own = free[i] ?? 0;
                    return `${own ? Math.round((assigned / own) * 100) : 0}%`;
                  })
                  .join(' and ')}
              </b>{' '}
              of your own free time. Those being equal is what fair means here.
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

      <Card title="Names">
        <div className={styles.names}>
          {state.people.map((person, index) => (
            <Field key={person.id} label={`Person ${index + 1}`}>
              {(id) => (
                <TextInput
                  id={id}
                  value={names[index] ?? ''}
                  onChange={(e) => {
                    const next = [...names];
                    next[index] = e.target.value;
                    setNames(next);
                  }}
                />
              )}
            </Field>
          ))}
        </div>
        <Button full onClick={() => renamePeople(names)}>
          Save names
        </Button>
      </Card>

      <Card title="Settings">
        <div className={styles.kv}>
          <span>Most work in any one day</span>
          <span>{formatMins(state.settings.dailyCap)}</span>
        </div>
        <Range
          min={20}
          max={240}
          step={10}
          value={state.settings.dailyCap}
          aria-label="Daily cap in minutes"
          onChange={(e) => setDailyCap(Number(e.target.value))}
        />
        <p className={styles.note}>
          Grim jobs — the WC, the litter tray, the bins, the oven — alternate rather than always
          landing on the same person. Nothing loud is scheduled after 21:00.
        </p>
        <div className={styles.actions}>
          <Button
            variant={confirming ? 'primary' : 'default'}
            onClick={() => {
              if (confirming) {
                resetAll();
                setConfirming(false);
              } else setConfirming(true);
            }}
          >
            {confirming ? 'Tap again to wipe' : 'Reset everything'}
          </Button>
          {confirming && <Button onClick={() => setConfirming(false)}>Cancel</Button>}
        </div>
      </Card>
    </>
  );
}
