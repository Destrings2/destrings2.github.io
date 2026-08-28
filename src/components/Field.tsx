import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, children }: FieldProps) {
  const id = useId();
  return (
    <div>
      {label ? (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children(id)}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[styles.input, className].filter(Boolean).join(' ')} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={[styles.select, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  );
}

export function Range({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input type="range" className={[styles.range, className].filter(Boolean).join(' ')} {...rest} />
  );
}
