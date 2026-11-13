import { useState } from 'react';
import { AuthPanel, invitationInUrl } from './AuthPanel';
import { useAuth } from '../useAuth';
import { flashNotice } from './SessionNotice';

const headings = {
  login: ['ログイン', '植物選びも、庭づくりも。', 'ひとつのアカウントでご利用いただけます。'],
  signup: ['新規登録', 'メールアドレスとパスワードで、', 'Kusakariのアカウントを作成します。'],
  invite: ['招待キーで登録', '店舗から受け取った招待キーで、', '店舗の担当者のアカウントを作成します。'],
  confirm: ['メールアドレスの確認', 'ご登録のメールアドレスに届いた', '確認コードで登録を完了します。'],
};

/**
 * Issue #87: login, sign-up and code confirmation all stay inside this one card without a page transition.
 */
export function LoginPage() {
  const { session } = useAuth();
  const [mode, setMode] = useState(
    /** @type {import('./AuthPanel').AuthMode} */ (invitationInUrl() !== null ? 'invite' : 'login'),
  );
  const [title, first, second] = headings[mode];
  return (
    <div className="login-page">
      <a className="login-brand" href="/" aria-label="Kusakari トップページ">
        kusakari.
      </a>
      <main className="login-card">
        <p className="eyebrow">KUSAKARI ACCOUNT</p>
        <h1>{title}</h1>
        <p className="login-description">
          {first}
          <br />
          {second}
        </p>
        {flashNotice && (
          <p className="flash-notice" role="status">
            {flashNotice}
          </p>
        )}
        <AuthPanel onModeChange={setMode} />
        {session?.authenticated && (
          <a className="login-home" href="/">
            トップページへ
          </a>
        )}
      </main>
    </div>
  );
}
