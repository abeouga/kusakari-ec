import { AuthPanel } from '../components/AuthPanel';
import { DeliveryForm } from '../components/DeliveryForm';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import { PasswordForm, WithdrawalForm } from './AccountSecurity';
export const accountActions = [
  ['/account/login', 'ログイン'],
  ['/account/register', '新規登録'],
  ['/account/pickup-contact', '受取連絡先'],
  ['/account/password', 'パスワード変更'],
  ['/account/reset', 'パスワードリセット'],
  ['/account/delete', '退会'],
];
/** @param {{tab:string}} props */
export function AccountPage({ tab }) {
  // Issue #11: purchases are picked up at the store, so the account keeps no postal address.
  const resource = useResource(tab === '受取連絡先' ? '/account/pickup-contact' : '/auth/me');
  if (tab === '新規登録') return <AuthPanel initialMode="signup" />;
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
