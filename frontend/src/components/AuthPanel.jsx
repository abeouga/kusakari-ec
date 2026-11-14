import { useState } from 'react';
import { useAuth } from '../useAuth';
import { AuthError, logout, passwordLogin } from '../auth';
import { SignupForm } from './SignupForm';
import '../css/auth-dialog.css';

/** @typedef {'login'|'signup'|'confirm'|'invite'} AuthMode */

/** Issue #111: the registration URL a store hands out carries its invitation key (`?invite=`). */
export const invitationInUrl = () => new URLSearchParams(window.location.search).get('invite');

/** @type {Record<string,string>} */
const accountLabels = {
  ADMIN: '管理者',
  SHOP_OWNER: '出店者（オーナー）',
  SHOP_STAFF: '出店者（スタッフ）',
  SHOP_OWNER_APPLICANT: '出店申請用アカウント',
};

/**
 * @param {{initialMode?:AuthMode, onModeChange?:(mode:AuthMode)=>void}} [props]
 */
export function AuthPanel({ initialMode = 'login', onModeChange } = {}) {
  const { session, error } = useAuth();
  const [mode, setMode] = useState(/** @type {AuthMode} */ (invitationInUrl() !== null ? 'invite' : initialMode));
  const [pending, setPending] = useState({ email: '', password: '' });
  const [failure, setFailure] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [destination, setDestination] = useState('');
  const params = new URLSearchParams(window.location.search);
  const returnTo =
    params.get('returnTo') ||
    (window.location.pathname === '/account/login' ? '/' : window.location.href.split('#')[0]);
  /** @param {string} target */
  async function complete(target) {
    setDestination(target);
    setSubmitting(true);
    setFailure('');
    window.location.replace(target);
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(event.currentTarget);
    setFailure('');
    setSubmitting(true);
    const email = String(data.get('email') || '');
    const password = String(data.get('password') || '');
    try {
      const target = await passwordLogin(email, password, returnTo);
      await complete(target);
    } catch (reason) {
      if (reason instanceof AuthError && reason.code === 'EMAIL_NOT_CONFIRMED') {
        setPending({ email: email.trim(), password });
        setSubmitting(false);
        switchMode('confirm');
        return;
      }
      setFailure(reason instanceof Error ? reason.message : 'ログインできませんでした。');
      setSubmitting(false);
    }
  }
  /** @param {AuthMode} next */
  function switchMode(next) {
    setFailure('');
    setMode(next);
    onModeChange?.(next);
  }
  if (error) return <p role="alert">{error}</p>;
  if (!session) return <p>ログイン状態を確認しています。</p>;
  if (session.mode === 'demo') return <p>Cognitoが未設定のため、ログイン・新規登録は利用できません。</p>;
  if (destination && submitting) {
    return (
      <div className="auth-redirecting" role="status" aria-label="移動しています">
        <span />
      </div>
    );
  }
  return (
    <section className="workspace-card">
      {(failure || params.get('auth') === 'failed') && (
        <p className="auth-error" role="alert">
          {failure || '認証が完了しませんでした。もう一度ログインしてください。'}
        </p>
      )}
      {session.authenticated ? (
        <>
          {invitationInUrl() !== null && (
            // Issue #105: an invitation key is for a new registration only; an existing account cannot join with it.
            <p className="auth-error" role="alert">
              招待キーは新規登録のときだけ使えます。ログアウトしてから、新しいアカウントとして登録してください。
            </p>
          )}
          <p>{session.name || session.email}</p>
          <p>{accountLabels[session.accountType || ''] || '利用者'}</p>
          <button
            disabled={loggingOut}
            onClick={() => {
              setFailure('');
              setLoggingOut(true);
              void logout().catch((reason) => {
                setFailure(reason.message);
                setLoggingOut(false);
              });
            }}
          >
            {loggingOut ? 'ログアウト中…' : 'ログアウト'}
          </button>
        </>
      ) : mode !== 'login' ? (
        <SignupForm
          step={mode === 'invite' ? 'signup' : mode}
          invitation={mode === 'invite' ? invitationInUrl() || '' : null}
          initialEmail={pending.email}
          initialPassword={pending.password}
          returnTo={returnTo}
          onStep={switchMode}
          onSignedIn={complete}
        />
      ) : (
        <>
          <form className="auth-form" onSubmit={submit} aria-busy={submitting}>
            <label>
              メールアドレス
              <input name="email" type="email" autoComplete="username" required maxLength={254} disabled={submitting} />
            </label>
            <label>
              パスワード
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={submitting}
              />
            </label>
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'ログイン中…' : 'ログイン'}
            </button>
          </form>
          <div className="auth-links">
            <a href={`/api/auth/login?managed=true&returnTo=${encodeURIComponent(returnTo)}`}>
              パスワードを忘れた方・追加の本人確認
            </a>
            <button type="button" onClick={() => switchMode('signup')}>
              新規登録
            </button>
            <button type="button" onClick={() => switchMode('invite')}>
              招待キーで登録（店舗の担当者）
            </button>
          </div>
        </>
      )}
    </section>
  );
}
