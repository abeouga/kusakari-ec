import { Dialog } from './Dialog';
import './seller-products.css';

/**
 * Confirmation step shared by irreversible operator and seller actions; same layout as the bulk product confirmation.
 * @param {{title:string,confirmLabel:string,busy:boolean,onConfirm:()=>void,onCancel:()=>void,children:import('react').ReactNode}} props
 */
export function ConfirmDialog({ title, confirmLabel, busy, onConfirm, onCancel, children }) {
  return (
    <Dialog
      role="alertdialog"
      title={title}
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="seller-confirm">
        {children}
        <button className="primary-button" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button disabled={busy} onClick={onCancel}>
          取消
        </button>
      </div>
    </Dialog>
  );
}
