import { AuthPanel } from '../components/AuthPanel';
import { useResource, write } from './useResource';
import { Input, ResourceStatus, values } from './ResourceView';
import { login } from '../auth';
export const accountActions = [
  ['/account/login', 'ログイン'],
  ['/account/register', '新規登録'],
  ['/account/address', '住所管理'],
  ['/account/password', 'パスワード変更'],
  ['/account/reset', 'パスワードリセット'],
  ['/account/delete', '退会'],
];
/** @param {{tab:string}} props */
export function AccountPage({ tab }) {
  const resource = useResource(tab === '住所管理' ? '/account/address' : '/auth/me');
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    const input = values(event.currentTarget);
    const password = tab === 'パスワード変更';
    if (
      (await resource.run(() => write(password ? '/account/password' : '/account/address', 'PUT', input))) &&
      password
    )
      login();
  }
  if (tab === '新規登録') return <button onClick={() => login(true)}>Cognitoで新規登録</button>;
  if (tab === 'パスワードリセット')
    return <a href="/api/auth/login?managed=true&returnTo=%2Faccount">Cognitoでパスワードを再設定</a>;
  if (tab === 'ログイン' || tab === 'アカウント情報') return <AuthPanel />;
  return (
    <section className="workspace-card">
      <ResourceStatus resource={resource} />
      {tab === '住所管理' && resource.data && (
        <form key={JSON.stringify(resource.data)} className="workspace-form" onSubmit={save}>
          <Input label="受取人" name="recipient" value={resource.data.recipient} maxLength={100} />
          <Input label="郵便番号" name="postal" value={resource.data.postal} maxLength={8} />
          <Input label="住所" name="address" value={resource.data.address} />
          <button disabled={resource.busy}>住所を保存</button>
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => void resource.run(() => write('/account/address', 'DELETE'))}
          >
            住所を削除
          </button>
        </form>
      )}
      {tab === 'パスワード変更' && (
        <form className="workspace-form" onSubmit={save}>
          <Input label="現在のパスワード" name="currentPassword" type="password" maxLength={256} />
          <Input label="新しいパスワード" name="newPassword" type="password" maxLength={256} />
          <p>変更後は再ログインしてください。</p>
          <button disabled={resource.busy}>パスワードを変更</button>
        </form>
      )}
      {tab === '退会' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await resource.run(() => write('/account', 'DELETE'), '退会しました。')) window.location.assign('/');
          }}
        >
          <p>このアカウントでKusakariを利用できなくなります。過去の注文記録は保持されます。</p>
          <label>
            <input type="checkbox" required />
            退会を確定することを確認しました
          </label>
          <button disabled={resource.busy}>退会を確定</button>
        </form>
      )}
    </section>
  );
}
