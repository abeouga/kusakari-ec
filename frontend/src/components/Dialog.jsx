import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** @param {{title:string, onClose:()=>void, children:import('react').ReactNode, wide?:boolean,role?:"dialog"|"alertdialog",className?:string}} props */
export function Dialog({ title, onClose, children, wide = false, role = 'dialog', className: extraClass = '' }) {
  const ref = useRef(/** @type {HTMLDialogElement|null} */ (null));
  let className = 'dialog';
  if (wide) className = 'dialog dialog-wide';
  if (extraClass) className += ` ${extraClass}`;
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!element) return;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      role={role}
      className={className}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="閉じる" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
