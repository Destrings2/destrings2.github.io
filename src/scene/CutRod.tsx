import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './CutRod.module.css';

interface Props {
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Drags the section-cut height. The model slices flat at whatever it reads. */
export function CutRod({ value, min, max, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function fromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;
    onChange(clamp((1 - (event.clientY - bounds.top) / bounds.height) * max, min, max));
  }

  const ticks = [];
  for (let m = 0; m <= max; m += 0.5) {
    ticks.push(
      <i
        key={m}
        className={Math.abs(m % 1) < 1e-6 ? styles.major : styles.minor}
        style={{ bottom: `${(m / max) * 100}%` }}
      />,
    );
  }

  return (
    <div
      ref={ref}
      className={styles.rod}
      role="slider"
      aria-label="Section cut height"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={`${value.toFixed(2)} metres`}
      tabIndex={0}
      onPointerDown={(event) => {
        dragging.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* dragging still works, it just stops at the rod's edge */
        }
        fromEvent(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) fromEvent(event);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.25 : 0.05;
        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
          onChange(clamp(value + step, min, max));
          event.preventDefault();
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
          onChange(clamp(value - step, min, max));
          event.preventDefault();
        }
      }}
    >
      <div className={styles.track} />
      <div className={styles.ticks}>{ticks}</div>
      <div className={styles.fill} style={{ height: `${(value / max) * 100}%` }}>
        <span className={styles.handle} aria-hidden />
        <span className={styles.value}>{value.toFixed(2)} m</span>
      </div>
      <span className={styles.cap}>Cut</span>
    </div>
  );
}
