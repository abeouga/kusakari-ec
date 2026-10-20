import { AuthPanel } from './AuthPanel';
import { useAuth } from '../useAuth';

/** @param {{onAuthenticated?:()=>Promise<unknown>}} props */
export function LoginPage({ onAuthenticated }) {
  const { session } = useAuth();
  return (
    <div className="login-page">
      <a className="login-brand" href="/" aria-label="Kusakari トップページ">
        kusakari.
      </a>
      <main className="login-card">
        <p className="eyebrow">KUSAKARI ACCOUNT</p>
        <h1>ログイン</h1>
        <p className="login-description">
          植物選びも、庭づくりも。
          <br />
          ひとつのアカウントでご利用いただけます。
        </p>
        <AuthPanel onAuthenticated={onAuthenticated} />
        {session?.authenticated && (
          <a className="login-home" href="/">
            トップページへ
          </a>
        )}
      </main>
    </div>
  );
}
