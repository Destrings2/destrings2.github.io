import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  variant?: Variant;
  size?: 'md' | 'sm';
  full?: boolean;
  iconOnly?: boolean;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  full = false,
  iconOnly = false,
  className,
  type = 'button',
  ...rest
}: Props) {
  const classes = [
    styles.btn,
    variant !== 'default' ? styles[variant] : null,
    size === 'sm' ? styles.sm : null,
    full ? styles.full : null,
    iconOnly ? styles.icon : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
