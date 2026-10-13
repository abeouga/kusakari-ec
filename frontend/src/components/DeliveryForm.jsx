import { useState } from 'react';
import { formText } from '../forms';

/** @param {{details:import('../types').DeliveryDetails,busy:boolean,onSave:(details:import('../types').DeliveryDetails)=>Promise<boolean|undefined>,onReset?:()=>void,lockedMethod?:boolean}} props */
export function DeliveryForm({ details, busy, onSave, onReset, lockedMethod = false }) {
  const safeDetails = details ?? {
    fulfillmentMethod: 'PICKUP',
    paymentMethod: '',
    recipientName: '',
    recipientPhone: '',
    contactEmail: '',
    postalCode: '',
    addressLine1: '',
    addressLine2: '',
    requestedDate: '',
    timeSlot: '',
  };

  const [method, setMethod] = useState(safeDetails.fulfillmentMethod);
  const [payment, setPayment] = useState(safeDetails.paymentMethod);

  /** @param {import('react').ChangeEvent<HTMLSelectElement>} event */
  function changeMethod(event) {
    const next = event.target.value;
    setMethod(next);
    if (next === 'DELIVERY' && payment === 'STORE') setPayment('DEMO_CARD');
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onSave({
      fulfillmentMethod: method,
      paymentMethod: payment,
      recipientName: formText(data, 'recipientName'),
      recipientPhone: formText(data, 'recipientPhone'),
      contactEmail: formText(data, 'contactEmail'),
      postalCode: formText(data, 'postalCode'),
      addressLine1: formText(data, 'addressLine1'),
      addressLine2: formText(data, 'addressLine2'),
      requestedDate: formText(data, 'requestedDate'),
      timeSlot: formText(data, 'timeSlot'),
    });
  }
  return (
    <form className="basic-form delivery-form" onSubmit={save}>
      <p className="eyebrow">RECEIVING & PAYMENT</p>
      <h3>受取・配送とお支払い</h3>
      <div className="form-grid">
        <label>
          受取方法
          <select name="fulfillmentMethod" value={method} onChange={changeMethod} disabled={busy || lockedMethod}>
            <option value="PICKUP">店舗受取（無料）</option>
            <option value="DELIVERY">自宅配送（送料800円）</option>
          </select>
        </label>
        <label>
          支払方法
          <select name="paymentMethod" value={payment} onChange={(e) => setPayment(e.target.value)} disabled={busy}>
            <option value="DEMO_CARD">カード決済</option>
            <option value="STORE" disabled={method === 'DELIVERY'}>
              店頭払い
            </option>
            <option value="DEMO_WALLET">ウォレット決済</option>
          </select>
        </label>
        <label>
          受取者名
          <input
            name="recipientName"
            defaultValue={safeDetails.recipientName}
            maxLength={100}
            required={method === 'DELIVERY'}
          />
        </label>
        <label>
          電話番号
          <input
            name="recipientPhone"
            type="tel"
            defaultValue={safeDetails.recipientPhone}
            maxLength={30}
            required={method === 'DELIVERY'}
          />
        </label>
        <label className="form-full">
          メールアドレス
          <input name="contactEmail" type="email" defaultValue={safeDetails.contactEmail} maxLength={200} />
        </label>
        {method === 'DELIVERY' && (
          <>
            <label>
              郵便番号
              <input
                name="postalCode"
                defaultValue={safeDetails.postalCode}
                maxLength={8}
                pattern="[0-9]{3}-?[0-9]{4}"
                required
              />
            </label>
            <label className="form-full">
              住所
              <input name="addressLine1" defaultValue={safeDetails.addressLine1} maxLength={200} required />
            </label>
            <label className="form-full">
              建物名・部屋番号
              <input name="addressLine2" defaultValue={safeDetails.addressLine2} maxLength={200} />
            </label>
          </>
        )}
        <label>
          受取・配送希望日
          <input name="requestedDate" type="date" defaultValue={safeDetails.requestedDate} />
        </label>
        <label>
          希望時間帯
          <select name="timeSlot" defaultValue={safeDetails.timeSlot}>
            <option value="ANY">指定なし</option>
            <option value="10-12">10:00〜12:00</option>
            <option value="14-16">14:00〜16:00</option>
            <option value="16-18">16:00〜18:00</option>
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          入力情報を保存
        </button>
        {onReset && (
          <button className="text-button" type="button" disabled={busy} onClick={onReset}>
            入力情報を削除
          </button>
        )}
      </div>
      {!lockedMethod && (
        <p className="fine-print">変更後は「入力情報を保存」を押してください。注文には保存済みの情報を使用します。</p>
      )}
      {lockedMethod && (
        <p className="fine-print">注文後は受取方法と請求金額を固定し、連絡先・希望日時・支払方法を編集できます。</p>
      )}
    </form>
  );
}
