import { AuthPanel } from '../components/AuthPanel';
import { DeliveryForm } from '../components/DeliveryForm';
import { useResource, write } from './useResource';
import { Input, ResourceStatus, values } from './ResourceView';
import { login } from '../auth';
import { PasswordForm, WithdrawalForm } from './AccountSecurity';
export const accountActions = [
  ['/account/login', 'ログイン'],
  ['/account/register', '新規登録'],
  ['/account/address', '住所管理'],
  ['/account/pickup-contact', '受取連絡先'],
  ['/account/password', 'パスワード変更'],
  ['/account/reset', 'パスワードリセット'],
  ['/account/delete', '退会'],
];
/** @param {{tab:string}} props */
export function AccountPage({ tab }) {
  const resource = useResource(
    tab === '住所管理' ? '/account/address' : tab === '受取連絡先' ? '/account/pickup-contact' : '/auth/me',
  );
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    const input = values(event.currentTarget);
    await resource.run(() => write('/account/address', 'PUT', input));
  }
  if (tab === '新規登録') return <button onClick={() => login(true)}>Cognitoで新規登録</button>;
  if (tab === 'パスワードリセット')
    return <a href="/api/auth/login?managed=true&returnTo=%2Faccount">Cognitoでパスワードを再設定</a>;
  if (tab === 'ログイン' || tab === 'アカウント情報') return <AuthPanel />;
  if (tab === 'パスワード変更')
    return (
      <section className="workspace-card">
        <PasswordForm />
      </section>
    );
  if (tab === '退会') return <WithdrawalForm />;
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
      {tab === '受取連絡先' && resource.data && (
        <DeliveryForm
          key={JSON.stringify(resource.data)}
          details={resource.data}
          busy={resource.busy}
          onSave={(details) =>
            resource.run(() => write('/account/pickup-contact', 'PUT', details), '受取連絡先を保存しました。')
          }
          onReset={() => resource.run(() => write('/account/pickup-contact', 'DELETE'), '受取連絡先を消去しました。')}
        />
      )}
    </section>
  );
}
