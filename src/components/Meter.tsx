import type { ReactNode } from 'react';
import styles from './Meter.module.css';

interface Props {
  name?: ReactNode;
  value?: ReactNode;
  /** 0..1. Clamped, so an over-committed week doesn't overflow its track. */
  fraction: number;
  colour: string;
  tall?: boolean;
  nameColour?: string;
}

export function Meter({ name, value, fraction, colour, tall, nameColour }: Props) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  return (
    <div className={tall ? styles.tall : undefined}>
      {(name || value) && (
        <div className={styles.row}>
          <span className={styles.name} style={nameColour ? { color: nameColour } : undefined}>
            {name}
          </span>
          <span className={styles.value}>{value}</span>
        </div>
      )}
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  );
}
