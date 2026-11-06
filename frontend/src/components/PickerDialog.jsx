import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from './Dialog';

/**
 * Modal chooser for the product wizard (issue #46). It is rendered outside the product form so that Enter
 * inside the dialog never submits the wizard. Esc closes it and the opening button gets focus back (Dialog).
 * @param {{title:string,wide?:boolean,onClose:()=>void,children:import('react').ReactNode}} props
 */
export function PickerDialog({ title, wide = false, onClose, children }) {
  const body = useRef(/** @type {HTMLDivElement|null} */ (null));
  useEffect(() => {
    // showModal() focuses the close button; start on the filter or the current choice instead.
    const target = body.current?.querySelector('[data-autofocus]');
    if (target instanceof HTMLElement) target.focus();
  }, []);
  return createPortal(
    <Dialog title={title} wide={wide} className="picker-dialog" onClose={onClose}>
      <div ref={body}>{children}</div>
    </Dialog>,
    document.body,
  );
}
