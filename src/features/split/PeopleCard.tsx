import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field, TextInput } from '@/components/Field';
import { ACCENTS, accentFor } from '@/data/palette';
import { useHousehold } from '@/store/household';
import styles from './PeopleCard.module.css';

/**
 * Names and accent colours.
 *
 * The colour is not decoration — it is how the rest of the app says who a job
 * belongs to, on the task stripe, the timeline lane, the meters and the floor
 * tint. So a colour another person already has is shown but disabled: two
 * people in the same amber would make every one of those unreadable.
 */
export function PeopleCard() {
  const people = useHousehold((s) => s.state.people);
  const renamePeople = useHousehold((s) => s.renamePeople);
  const setPersonColour = useHousehold((s) => s.setPersonColour);

  // Only the edits are held, not a copy of every name. A rename arriving from
  // the other device then shows through immediately for anyone who is not
  // being typed into, with no effect needed to reconcile the two.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const valueFor = (id: string, fallback: string) => edits[id] ?? fallback;
  const dirty = people.some((p) => valueFor(p.id, p.name).trim() !== p.name);

  return (
    <Card title={people.length === 1 ? 'You' : 'People'}>
      {people.map((person) => {
        const takenByOthers = new Set(
          people.filter((p) => p.id !== person.id).map((p) => p.colour.toUpperCase()),
        );
        const current = accentFor(person.colour);

        return (
          <div key={person.id} className={styles.person}>
            <Field label={`Name`}>
              {(id) => (
                <TextInput
                  id={id}
                  value={valueFor(person.id, person.name)}
                  onChange={(e) => setEdits({ ...edits, [person.id]: e.target.value })}
                />
              )}
            </Field>

            <span className={styles.label}>Colour{current ? ` · ${current.name}` : ''}</span>
            <div
              className={styles.swatches}
              role="radiogroup"
              aria-label={`${person.name}'s colour`}
            >
              {ACCENTS.map((accent) => {
                const taken = takenByOthers.has(accent.hex.toUpperCase());
                const chosen = accent.hex.toUpperCase() === person.colour.toUpperCase();
                return (
                  <button
                    key={accent.id}
                    className={styles.swatch}
                    style={{ ['--tone' as string]: accent.hex }}
                    aria-pressed={chosen}
                    disabled={taken}
                    title={taken ? `${accent.name} — already taken` : accent.name}
                    aria-label={
                      taken
                        ? `${accent.name}, already taken`
                        : `Use ${accent.name} for ${person.name}`
                    }
                    onClick={() => setPersonColour(person.id, accent.hex)}
                  >
                    {chosen ? <span aria-hidden>✓</span> : null}
                  </button>
                );
              })}
            </div>
            {people.length > 1 && (
              <p className={styles.taken}>Greyed-out colours belong to someone else.</p>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 'var(--s4)' }}>
        <Button
          full
          disabled={!dirty}
          onClick={() => {
            renamePeople(people.map((p) => valueFor(p.id, p.name)));
            setEdits({});
          }}
        >
          {dirty ? 'Save names' : 'Names saved'}
        </Button>
      </div>
    </Card>
  );
}
