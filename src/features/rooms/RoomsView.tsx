import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field, Select, TextInput } from '@/components/Field';
import { CADENCE, CADENCE_ORDER } from '@/domain/cadence';
import { averageWeekly } from '@/domain/totals';
import { formatMins } from '@/domain/time';
import type { Cadence, RoomId } from '@/domain/types';
import { useWeek } from '@/hooks/useWeek';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useHousehold } from '@/store/household';
import { useProperty } from '@/store/property';
import { loadKey, roomNameIn, roomOptions } from '@/store/selectors';
import { useUi } from '@/store/ui';
import styles from './RoomsView.module.css';

export function RoomsView() {
  const state = useHousehold((s) => s.state);
  const { addChore, toggleChore, removeChore } = useHousehold();
  const { openRoom, openRoomDetail } = useUi();
  const plan = useProperty((s) => s.plan);
  const week = useWeek();

  const isDesktop = useIsDesktop();
  const switcherRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  // A tap on the model (or a chip off-screen) should leave the active room
  // visible in the strip, without scrolling the page itself.
  useEffect(() => {
    const host = switcherRef.current;
    const active = host?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!host || !active) return;
    host.scrollTo({
      left: active.offsetLeft - (host.clientWidth - active.offsetWidth) / 2,
      // Instant on first paint; animated only for changes the user can see.
      behavior: settled.current ? 'smooth' : 'auto',
    });
    settled.current = true;
  }, [openRoom]);

  const [name, setName] = useState('');
  const [mins, setMins] = useState('10');
  const [cadence, setCadence] = useState<Cadence>('weekly');

  const roomId: RoomId = openRoom;
  const room = plan.rooms.find((r) => r.slug === openRoom);
  const here = state.chores.filter((c) => c.roomId === roomId);
  const load = week.load[loadKey(roomId)] ?? { left: 0, total: 0, byPerson: {} };

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addChore({ roomId, name: trimmed, mins: Math.max(1, Number(mins) || 10), cadence });
    setName('');
    setMins('10');
  }

  return (
    <>
      <div className={styles.switcher} ref={switcherRef} role="group" aria-label="Rooms">
        {roomOptions(plan).map((option) => (
          <button
            key={option.key}
            className={styles.roomChip}
            aria-pressed={openRoom === option.id}
            onClick={() => openRoomDetail(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>

      <Card
        title={roomNameIn(plan, roomId)}
        aside={room ? `${room.dimsLabel} · ${room.areaSqm} m²` : undefined}
      >
        <div className={styles.kv}>
          <span>This week</span>
          <span>
            {formatMins(load.total)} planned · {formatMins(load.left)} left
          </span>
        </div>
        <div className={styles.kv}>
          <span>Steady state</span>
          <span>{formatMins(Math.round(averageWeekly(state.chores, roomId)))} a week</span>
        </div>
        <p className={styles.hint}>
          {isDesktop ? 'Tap any room in the model to jump to it. ' : ''}
          {here.length} job{here.length === 1 ? '' : 's'} here.
        </p>
      </Card>

      <Card title="Jobs">
        {here.length === 0 && <p className={styles.hint}>Nothing here yet.</p>}
        {here.map((chore) => (
          <div key={chore.id} className={`${styles.chore} ${chore.enabled ? '' : styles.off}`}>
            <button
              className={styles.toggle}
              aria-pressed={chore.enabled}
              aria-label={chore.enabled ? `Turn off ${chore.name}` : `Turn on ${chore.name}`}
              onClick={() => toggleChore(chore.id)}
            >
              {chore.enabled ? '✓' : ''}
            </button>
            <div className={styles.body}>
              <span>{chore.name}</span>
              <small>
                {formatMins(chore.mins)} · {CADENCE[chore.cadence].label}
                {chore.grim ? ' · rotates' : ''}
                {chore.noisy ? ' · not late' : ''}
              </small>
            </div>
            <button
              className={styles.remove}
              onClick={() => removeChore(chore.id)}
              aria-label={`Remove ${chore.name}`}
            >
              ×
            </button>
          </div>
        ))}

        <div className={styles.add}>
          <Field label="Add a job">
            {(id) => (
              <TextInput
                id={id}
                value={name}
                placeholder="What needs doing"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            )}
          </Field>
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
        </div>
        <div className={styles.addRow}>
          <Field label="How often">
            {(id) => (
              <Select
                id={id}
                value={cadence}
                onChange={(e) => setCadence(e.target.value as Cadence)}
              >
                {CADENCE_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {CADENCE[key].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </Card>

    </>
  );
}
