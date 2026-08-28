import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DESKTOP_QUERY } from '@/hooks/useMediaQuery';
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

  // The grip is a real control, not decoration: dragging it down closes the
  // sheet. Only on the phone shape — the centred desktop dialog doesn't move.
  const drag = useRef<{ startY: number; dy: number } | null>(null);

  function follow(dy: number) {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.transition = 'none';
    dialog.style.translate = `0 ${dy}px`;
  }

  function settle(close: boolean) {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.transition = '';
    dialog.style.translate = '';
    if (close) onClose();
  }

  const gripHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (window.matchMedia(DESKTOP_QUERY).matches) return;
      drag.current = { startY: event.clientY, dy: 0 };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* the drag still works, it just stops at the grip's edge */
      }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = drag.current;
      if (!session) return;
      session.dy = Math.max(0, event.clientY - session.startY);
      follow(session.dy);
    },
    onPointerUp: () => {
      const session = drag.current;
      drag.current = null;
      if (session) settle(session.dy > 90);
    },
    onPointerCancel: () => {
      drag.current = null;
      settle(false);
    },
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClick={(event) => {
        // A click that lands on the dialog element itself is the backdrop.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.grip} {...gripHandlers}>
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
