import { useState } from 'react';
import { ApiError } from '../api';
import { login } from '../auth';
import { PageLink } from './Common';
import { goBack } from './navigation';
import { write } from './useResource';
import './account.css';

/** @type {Record<string,string>} Only these workflow states block withdrawal. */
const openOrderLabels = { ACCEPTED: '注文受付', READY: '受取準備完了' };

/** @param {unknown} reason @param {string} fallback */
const messageOf = (reason, fallback) => (reason instanceof Error ? reason.message : fallback);

/** EC-B19. Success ends the session, so the login page is loaded fresh with the completion message. */
export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      currentPassword: String(data.get('currentPassword') || ''),
      newPassword: String(data.get('newPassword') || ''),
      confirmPassword: String(data.get('confirmPassword') || ''),
    };
    if (input.newPassword.length < 8) return setError('新しいパスワードは8文字以上で入力してください。');
    if (input.newPassword !== input.confirmPassword)
      return setError('新しいパスワードと確認用パスワードが一致しません。');
    setBusy(true);
    setError('');
    try {
      await write('/account/password', 'PUT', input);
      window.location.assign('/account/login?notice=password-changed');
    } catch (reason) {
      setError(messageOf(reason, 'パスワードを変更できませんでした。'));
      setBusy(false);
    }
  }
  return (
    <form className="workspace-form" onSubmit={submit} noValidate>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {[
        ['currentPassword', '現在のパスワード', 'current-password'],
        ['newPassword', '新しいパスワード（8文字以上）', 'new-password'],
        ['confirmPassword', '確認用パスワード', 'new-password'],
      ].map(([name, label, autoComplete]) => (
        <label key={name}>
          {label}
          <input name={name} type="password" autoComplete={autoComplete} required maxLength={256} />
        </label>
      ))}
      <p>変更後はログアウトします。新しいパスワードでログインしてください。</p>
      <button disabled={busy}>{busy ? '変更しています…' : 'パスワードを変更'}</button>
    </form>
  );
}

/** @typedef {{message:string,code:string,orders:{id:string,status:string}[],login?:boolean}} Refusal */

/** EC-B21. The server decides at button press whether open orders or listings block the withdrawal. */
export function WithdrawalForm() {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(/** @type {Refusal|null} */ (null));
  async function withdraw() {
    setBusy(true);
    setRefusal(null);
    try {
      await write('/account', 'DELETE');
      window.location.assign('/?notice=withdrawn');
      return;
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500)
        setRefusal({ message: '退会処理に失敗しました。時間をおいて再度お試しください。', code: '', orders: [] });
      else if (reason.status === 401) setRefusal({ message: reason.message, code: '', orders: [], login: true });
      else setRefusal({ message: reason.message, code: reason.code, orders: reason.body?.orders ?? [] });
    }
    setBusy(false);
  }
  return (
    <section className="workspace-card withdrawal">
      <h2>退会の前にご確認ください</h2>
      <ul>
        <li>退会すると元に戻せません。このアカウントでは再びログインできなくなります。</li>
        <li>受け渡しが完了していない注文がある間は退会できません。</li>
        <li>
          出店者の方は、出品中の商品、引き渡しが完了していない注文、処理していないキャンセル申請がある間は退会できません。
        </li>
        <li>過去の注文の記録は、注文実績のために保持されます。</li>
      </ul>
      <label>
        <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} />
        注意事項を確認し、退会することに同意します
      </label>
      {refusal && <WithdrawalRefusal refusal={refusal} />}
      <div className="workspace-actions">
        <button type="button" onClick={goBack} disabled={busy}>
          戻る
        </button>
        <button type="button" className="danger-button" disabled={!agreed || busy} onClick={() => void withdraw()}>
          {busy ? '退会処理中…' : 'アカウントを削除する'}
        </button>
      </div>
    </section>
  );
}

/** @param {{refusal:Refusal}} props */
function WithdrawalRefusal({ refusal }) {
  return (
    <div role="alert" className="error withdrawal-refusal">
      <p>{refusal.message}</p>
      {refusal.login && (
        <button type="button" onClick={() => login()}>
          ログインする
        </button>
      )}
      {refusal.code === 'WITHDRAWAL_OPEN_ORDERS' && (
        <>
          <ul aria-label="受け渡しが完了していない注文">
            {refusal.orders.map((order) => (
              <li key={order.id}>
                注文番号 {order.id}（{openOrderLabels[order.status] || order.status}）
              </li>
            ))}
          </ul>
          <PageLink href="/purchases">注文履歴を確認する</PageLink>
        </>
      )}
      {refusal.code === 'WITHDRAWAL_LISTED_PRODUCTS' && <PageLink href="/seller/products">商品一覧を確認する</PageLink>}
      {refusal.code === 'WITHDRAWAL_STORE_ORDERS' && (
        <PageLink href="/seller/orders">注文一覧・キャンセル申請を確認する</PageLink>
      )}
    </div>
  );
}
