import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Select, TextInput } from '@/components/Field';
import { CADENCE, CADENCE_ORDER } from '@/domain/cadence';
import { formatMins } from '@/domain/time';
import type { Cadence, Chore, RoomId } from '@/domain/types';
import { useHousehold } from '@/store/household';
import { useProperty } from '@/store/property';
import { loadKey, roomOptions, WHOLE_HOME } from '@/store/selectors';
import styles from './RoomsView.module.css';

interface Props {
  chore: Chore;
  onDone(): void;
}

/**
 * Everything about a job that was decided when it was added, and until now
 * could only be changed by deleting it and typing it in again: what it is
 * called, how long it takes, how often, which room it belongs to, whether
 * either of you would rather be the one doing it, and the two flags that
 * decide when in the week it can land.
 */
export function ChoreEditor({ chore, onDone }: Props) {
  const editChore = useHousehold((s) => s.editChore);
  const dailyCap = useHousehold((s) => s.state.settings.dailyCap);
  const people = useHousehold((s) => s.state.people);
  const plan = useProperty((s) => s.plan);

  const [name, setName] = useState(chore.name);
  const [mins, setMins] = useState(String(chore.mins));
  const [cadence, setCadence] = useState<Cadence>(chore.cadence);
  const [roomId, setRoomId] = useState<RoomId>(chore.roomId);
  const [noisy, setNoisy] = useState(chore.noisy);
  const [grim, setGrim] = useState(chore.grim);
  const [preferredBy, setPreferredBy] = useState(chore.preferredBy);

  const minutes = Math.max(1, Number(mins) || chore.mins);
  const trimmed = name.trim();
  const tooLong = minutes > dailyCap;
  const changed =
    trimmed !== chore.name ||
    minutes !== chore.mins ||
    cadence !== chore.cadence ||
    roomId !== chore.roomId ||
    noisy !== chore.noisy ||
    grim !== chore.grim ||
    preferredBy !== chore.preferredBy;

  function save() {
    if (!trimmed) return;
    editChore(chore.id, {
      name: trimmed,
      mins: minutes,
      cadence,
      roomId,
      noisy,
      grim,
      preferredBy,
    });
    onDone();
  }

  return (
    <div className={styles.editor}>
      <Field label="Name">
        {(id) => (
          <TextInput
            id={id}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trimmed) save();
              if (e.key === 'Escape') onDone();
            }}
          />
        )}
      </Field>

      <div className={styles.editorGrid}>
        <Field label="Minutes">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              value={mins}
              onChange={(e) => setMins(e.target.value)}
            />
          )}
        </Field>

        <Field label="How often">
          {(id) => (
            <Select id={id} value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
              {CADENCE_ORDER.map((key) => (
                <option key={key} value={key}>
                  {CADENCE[key].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Room">
          {(id) => (
            // A whole-home job has no room at all, so the select carries the
            // sentinel the rest of the app already keys that case on.
            <Select
              id={id}
              value={loadKey(roomId)}
              onChange={(e) => setRoomId(e.target.value === WHOLE_HOME ? null : e.target.value)}
            >
              {roomOptions(plan).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {tooLong && (
        <p className={styles.warn}>
          Longer than the {formatMins(dailyCap)} a single day is allowed to hold, so the planner
          won&rsquo;t place it. Split it up, or raise the daily cap in Settings.
        </p>
      )}

      <span className={styles.label}>Who&rsquo;d rather do it</span>
      <div className={styles.flags} role="radiogroup" aria-label="Who would rather do it">
        <Button
          size="sm"
          role="radio"
          aria-checked={preferredBy === null}
          onClick={() => setPreferredBy(null)}
        >
          Either of you
        </Button>
        {people.map((person) => (
          <Button
            key={person.id}
            size="sm"
            role="radio"
            aria-checked={preferredBy === person.id}
            style={
              preferredBy === person.id
                ? {
                    background: person.colour,
                    borderColor: person.colour,
                    color: 'var(--on-signal)',
                  }
                : undefined
            }
            onClick={() => {
              setPreferredBy(person.id);
              // Rotating and preferring are opposite instructions; taking the
              // preference means dropping the rotation rather than having the
              // planner weigh one against the other behind your back.
              setGrim(false);
            }}
          >
            {person.name}
          </Button>
        ))}
      </div>

      <div className={styles.flags}>
        <Button
          size="sm"
          aria-pressed={grim}
          onClick={() => {
            setGrim(!grim);
            if (!grim) setPreferredBy(null);
          }}
        >
          Rotates
        </Button>
        <Button size="sm" aria-pressed={noisy} onClick={() => setNoisy(!noisy)}>
          Not late
        </Button>
      </div>
      <p className={styles.hint}>
        A preference is a lean, not a rule: the job goes to whoever wants it while the week is still
        even, and gives way once that would leave one of you doing more than your share. A job that{' '}
        <b>rotates</b> alternates instead, so the same person doesn&rsquo;t always get it. One
        marked <b>not late</b> is kept out of the early morning and late evening.
      </p>

      <div className={styles.editorRow}>
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!trimmed || !changed} onClick={save}>
          {changed ? 'Save' : 'Saved'}
        </Button>
      </div>
    </div>
  );
}
