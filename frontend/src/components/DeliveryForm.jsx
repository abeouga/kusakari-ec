import { formText } from '../forms';
/** @param {{details:import('../types').DeliveryDetails,busy:boolean,onSave:(details:import('../types').PickupInput)=>Promise<boolean|undefined>,onReset?:()=>void,lockedMethod?:boolean}} props */
export function DeliveryForm({ details, busy, onSave, onReset }) {
  /** @param {import('react').FormEvent<HTMLFormElement>} e */
  function save(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void onSave({
      recipientName: formText(data, 'recipientName'),
      recipientPhone: formText(data, 'recipientPhone'),
      contactEmail: formText(data, 'contactEmail'),
    });
  }
  return (
    <form className="workspace-form" onSubmit={save}>
      <h3>店舗受け取りの連絡先（任意）</h3>
      <label>
        受取人
        <input name="recipientName" defaultValue={details?.recipientName || ''} maxLength={100} />
      </label>
      <label>
        電話番号
        <input
          name="recipientPhone"
          defaultValue={details?.recipientPhone || ''}
          maxLength={30}
          pattern="[0-9+() \-]*"
        />
      </label>
      <label>
        連絡先メール
        <input name="contactEmail" type="email" defaultValue={details?.contactEmail || ''} maxLength={200} />
      </label>
      <button disabled={busy}>連絡先を保存</button>
      {onReset && (
        <button type="button" disabled={busy} onClick={onReset}>
          連絡先を消去
        </button>
      )}
    </form>
  );
}
