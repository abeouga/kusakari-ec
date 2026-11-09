import { useState } from 'react';
import { confirmSignUp, passwordLogin, resendSignUpCode, signUp } from '../auth';

/** @typedef {'signup'|'confirm'} SignupStep */

/**
 * Issue #87: registration inside the login card. The password stays only in this component's memory
 * so the member can be signed in right after the confirmation code is accepted.
 * @param {{step:SignupStep, initialEmail?:string, initialPassword?:string, returnTo:string, onStep:(step:SignupStep|'login')=>void,
 *   onSignedIn:(target:string)=>Promise<void>}} props
 */
export function SignupForm({ step, initialEmail = '', initialPassword = '', returnTo, onStep, onSignedIn }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  /** @param {()=>Promise<void>} action */
  async function run(action) {
    if (busy) return;
    setFailure('');
    setNotice('');
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : '処理できませんでした。時間をおいて再試行してください。');
    } finally {
      setBusy(false);
    }
  }

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function register(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const address = String(data.get('email') || '').trim();
    const secret = String(data.get('password') || '');
    void run(async () => {
      await signUp(address, secret, String(data.get('confirmPassword') || ''));
      setEmail(address);
      setPassword(secret);
      onStep('confirm');
    });
  }

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function confirm(event) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') || '').trim();
    void run(async () => {
      await confirmSignUp(email, code);
      if (!password) {
        onStep('login');
        return;
      }
      await onSignedIn(await passwordLogin(email, password, returnTo));
    });
  }

  if (step === 'confirm') {
    return (
      <>
        {failure && (
          <p className="auth-error" role="alert">
            {failure}
          </p>
        )}
        {notice && (
          <p className="auth-success" role="status">
            {notice}
          </p>
        )}
        <form className="auth-form" onSubmit={confirm} aria-busy={busy}>
          <p className="auth-note">{email} に送信した6桁の確認コードを入力してください。</p>
          <label>
            確認コード
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\s*\d{6}\s*"
              maxLength={8}
              required
              disabled={busy}
            />
          </label>
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '確認中…' : '確認して登録を完了'}
          </button>
        </form>
        <div className="auth-links">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await resendSignUpCode(email);
                setNotice('確認コードを再送しました。');
              })
            }
          >
            確認コードを再送する
          </button>
          <button type="button" onClick={() => onStep('login')}>
            ログインに戻る
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      {failure && (
        <p className="auth-error" role="alert">
          {failure}
        </p>
      )}
      <form className="auth-form" onSubmit={register} aria-busy={busy}>
        <label>
          メールアドレス
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            defaultValue={email}
            disabled={busy}
          />
        </label>
        <label>
          パスワード（8文字以上）
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            disabled={busy}
          />
        </label>
        <label>
          パスワード（確認）
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            disabled={busy}
          />
        </label>
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? '登録中…' : '確認コードを送信'}
        </button>
      </form>
      <div className="auth-links">
        <button type="button" onClick={() => onStep('login')}>
          アカウントをお持ちの方はログイン
        </button>
      </div>
    </>
  );
}
