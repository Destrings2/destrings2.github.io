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
 * called, how long it takes, how often, which room it belongs to, and the two
 * flags that decide when in the week it can land.
 */
export function ChoreEditor({ chore, onDone }: Props) {
  const editChore = useHousehold((s) => s.editChore);
  const dailyCap = useHousehold((s) => s.state.settings.dailyCap);
  const plan = useProperty((s) => s.plan);

  const [name, setName] = useState(chore.name);
  const [mins, setMins] = useState(String(chore.mins));
  const [cadence, setCadence] = useState<Cadence>(chore.cadence);
  const [roomId, setRoomId] = useState<RoomId>(chore.roomId);
  const [noisy, setNoisy] = useState(chore.noisy);
  const [grim, setGrim] = useState(chore.grim);

  const minutes = Math.max(1, Number(mins) || chore.mins);
  const trimmed = name.trim();
  const tooLong = minutes > dailyCap;
  const changed =
    trimmed !== chore.name ||
    minutes !== chore.mins ||
    cadence !== chore.cadence ||
    roomId !== chore.roomId ||
    noisy !== chore.noisy ||
    grim !== chore.grim;

  function save() {
    if (!trimmed) return;
    editChore(chore.id, { name: trimmed, mins: minutes, cadence, roomId, noisy, grim });
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

        {tooLong && (
          <p className={styles.warn}>
            Longer than the {formatMins(dailyCap)} a single day is allowed to hold, so the planner
            won&rsquo;t place it. Split it up, or raise the daily cap in Settings.
          </p>
        )}

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

      <div className={styles.flags}>
        <Button size="sm" aria-pressed={grim} onClick={() => setGrim(!grim)}>
          Rotates
        </Button>
        <Button size="sm" aria-pressed={noisy} onClick={() => setNoisy(!noisy)}>
          Not late
        </Button>
      </div>
      <p className={styles.hint}>
        A job that <b>rotates</b> alternates between you rather than always landing on the same
        person. One marked <b>not late</b> is kept out of the early morning and late evening.
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
