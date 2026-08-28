import { formatMins, hhmm } from '@/domain/time';
import type { PlanEntry } from '@/domain/types';
import { useHousehold } from '@/store/household';
import { useProperty } from '@/store/property';
import { choreById, personById, roomNameIn } from '@/store/selectors';
import styles from './TaskRow.module.css';

interface Props {
  entry: PlanEntry;
  done: boolean;
  onOpen(key: string): void;
  onToggle(key: string): void;
  /** Day view already groups by person, so the name would be noise there. */
  showPerson?: boolean;
}

export function TaskRow({ entry, done, onOpen, onToggle, showPerson = true }: Props) {
  const state = useHousehold((s) => s.state);
  const plan = useProperty((s) => s.plan);
  const chore = choreById(state, entry.choreId);
  const person = personById(state, entry.personId);
  if (!chore) return null;

  const bits = [
    entry.at != null ? hhmm(entry.at) : null,
    showPerson ? person?.name : null,
    roomNameIn(plan, chore.roomId),
  ].filter(Boolean);

  return (
    <div
      className={`${styles.task} ${done ? styles.done : ''}`}
      style={{ borderLeftColor: person?.colour ?? 'var(--line-strong)' }}
    >
      <button className={styles.open} onClick={() => onOpen(entry.key)}>
        <span className={styles.name}>
          {chore.name}
          {entry.pinned && <span className={styles.pin}>› pinned</span>}
        </span>
        <span className={styles.meta}>{bits.join(' · ')}</span>
      </button>
      <span className={styles.mins}>{formatMins(entry.mins)}</span>
      <button
        className={styles.tick}
        onClick={() => onToggle(entry.key)}
        aria-pressed={done}
        aria-label={done ? `Mark ${chore.name} not done` : `Mark ${chore.name} done`}
      >
        {done ? '✓' : ''}
      </button>
    </div>
  );
}
