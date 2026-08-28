import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface Props {
  title?: ReactNode;
  aside?: ReactNode;
  accent?: boolean;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({ title, aside, accent, flush, className, children }: Props) {
  const classes = [
    styles.card,
    accent ? styles.accent : null,
    flush ? styles.flush : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes}>
      {(title || aside) && (
        <header className={styles.head}>
          {title ? <h3 className={styles.title}>{title}</h3> : <span />}
          {aside ? <span className={styles.aside}>{aside}</span> : null}
        </header>
      )}
      {children}
    </section>
  );
}
