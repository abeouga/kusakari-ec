import { useEffect, useState } from 'react';
import { sessionExpiredEvent, sessionExpiredMessage } from '../api';
import { login } from '../auth';
import '../css/session-notice.css';

/** EC-*b: shown over the current screen, so what the user typed stays in place until they choose to log in. */
export function SessionNotice() {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const show = () => setExpired(true);
    window.addEventListener(sessionExpiredEvent, show);
    return () => window.removeEventListener(sessionExpiredEvent, show);
  }, []);
  if (!expired) return null;
  return (
    <div className="session-notice" role="alert">
      <p>{sessionExpiredMessage}</p>
      <p className="session-notice-detail">ログインすると、この画面に戻ります。</p>
      <div>
        <button type="button" onClick={() => login()}>
          ログインする
        </button>
        <button type="button" className="session-notice-close" onClick={() => setExpired(false)}>
          閉じる
        </button>
      </div>
    </div>
  );
}

const flashMessages = /** @type {Record<string,string>} */ ({
  withdrawn: '退会が完了しました。ご利用ありがとうございました。',
  'password-changed': 'パスワードを変更しました。新しいパスワードでログインしてください。',
});

/**
 * Completion messages that must survive a full page load (the session ends on withdrawal and password change).
 * Read once at startup and removed from the URL so a reload does not repeat them.
 */
export const flashNotice = (() => {
  const url = new URL(window.location.href);
  const key = url.searchParams.get('notice') || '';
  if (!key) return '';
  url.searchParams.delete('notice');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return flashMessages[key] || '';
})();
