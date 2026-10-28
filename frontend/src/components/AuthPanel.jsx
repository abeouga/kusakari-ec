import { useState } from 'react';
import { useAuth } from '../useAuth';
import { login, logout, passwordLogin } from '../auth';
import { PageLink } from '../workspace/Common';
import '../css/auth-dialog.css';

/** @param {{onAuthenticated?:()=>Promise<unknown>}} [props] */
export function AuthPanel({ onAuthenticated } = {}) {
  const { session, error } = useAuth();
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
    try {
      if (onAuthenticated) await onAuthenticated();
      window.location.replace(target);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'カートを引き継げませんでした。再試行してください。');
      setSubmitting(false);
    }
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(event.currentTarget);
    setFailure('');
    setSubmitting(true);
    try {
      const target = await passwordLogin(String(data.get('email') || ''), String(data.get('password') || ''), returnTo);
      await complete(target);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'ログインできませんでした。');
      setSubmitting(false);
    }
  }
  if (error) return <p role="alert">{error}</p>;
  if (!session) return <p>ログイン状態を確認しています。</p>;
  if (session.mode === 'demo') return <p>Cognitoが未設定のため、ログイン・新規登録は利用できません。</p>;
  if (destination && submitting) {
    return <div className="auth-redirecting" role="status" aria-label="移動しています"><span /></div>;
  }
  return (
    <section className="workspace-card">
      {(failure || params.get('auth') === 'failed') && (
        <p className="auth-error" role="alert">
          {failure || '認証が完了しませんでした。もう一度ログインしてください。'}
        </p>
      )}
      {destination ? <>
        <button onClick={() => void complete(destination)}>カートを引き継いで続ける</button>
        <PageLink href="/cart">カートに戻る</PageLink>
      </> : session.authenticated ? (
        <>
          <p>{session.name || session.email}</p>
          <p>{session.role === 'ADMIN' ? '管理者' : session.role === 'SELLER' ? '出店者' : '利用者'}</p>
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
            <button type="button" onClick={() => login(true)}>
              新規登録
            </button>
          </div>
        </>
      )}
    </section>
  );
}
