import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Overlay.module.css';

interface Props {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
}

export function Overlay({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Esc and the backdrop both go through the dialog's own close event, so the
  // caller only has to know about one exit.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = () => onClose();
    dialog.addEventListener('close', handle);
    dialog.addEventListener('cancel', handle);
    return () => {
      dialog.removeEventListener('close', handle);
      dialog.removeEventListener('cancel', handle);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClick={(event) => {
        // A click that lands on the dialog element itself is the backdrop.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.grip}>
        <i />
      </div>
      <header className={styles.head}>
        <h2>{title}</h2>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
