import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Lightweight portal-based modal. Closes on Escape or backdrop click.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className='modal-backdrop' onClick={onClose}>
      <div
        className='modal'
        role='dialog'
        aria-modal='true'
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type='button'
          className='modal-close'
          onClick={onClose}
          aria-label='Close'
        >
          ✕
        </button>
        {title && <h2 className='modal-title'>{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
