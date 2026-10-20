import { useState } from 'react';
import { useAuth } from '../useAuth';
import { login, logout } from '../auth';

export function AuthPanel() {
  const { session, error } = useAuth();
  const [failure, setFailure] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  if (error) return <p role="alert">{error}</p>;
  if (!session) return <p>ログイン状態を確認しています。</p>;
  if (session.mode === 'demo') return <p>Cognitoが未設定のため、ログイン・新規登録は利用できません。</p>;
  return <section className="workspace-card">
    {session.authenticated ? <>
      <p>{session.name || session.email}</p>
      <p>{session.role === 'ADMIN' ? '管理者' : session.role === 'SELLER' ? '出店者' : '利用者'}</p>
      <button disabled={loggingOut} onClick={() => {
        setFailure('');
        setLoggingOut(true);
        void logout().catch((reason) => { setFailure(reason.message); setLoggingOut(false); });
      }}>{loggingOut ? 'ログアウト中…' : 'ログアウト'}</button>
    </> : <>
      <p>ログイン・新規登録・パスワード再設定は認証画面で行います。</p>
      <button onClick={() => login()}>ログイン</button>
      <button onClick={() => login(true)}>新規登録</button>
    </>}
    {failure && <p role="alert">{failure}</p>}
  </section>;
}
