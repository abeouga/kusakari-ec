import { useState } from 'react';
import { Field, text } from './Common';

export const accountActions = [
  ['/account/login', 'ログイン'],
  ['/account/register', '新規登録'],
  ['/account/address', '住所管理'],
  ['/account/password', 'パスワード変更'],
  ['/account/reset', 'パスワードリセット'],
  ['/account/delete', '退会'],
];

/** @param {{demo:import('./useDemo').Demo,tab:string}} props */
export function AccountPage({ demo, tab }) {
  const [resetReady, setResetReady] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    const email = text(data, 'email');
    const password = text(data, 'password');
    if (password && password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }
    if (tab === '新規登録') {
      if (demo.state.users.some((user) => user.email === email)) {
        setError('このメールアドレスは登録済みです。');
        return;
      }
      demo.update((draft) => {
        const user = {
          id: crypto.randomUUID(),
          name: text(data, 'name'),
          email,
          role: text(data, 'role'),
          status: '利用中',
        };
        draft.users.push(user);
        draft.session = { name: user.name, email, role: user.role };
      }, 'アカウントを作成しました。');
    } else if (tab === 'ログイン') {
      const user = demo.state.users.find((entry) => entry.email === email && entry.status === '利用中');
      if (!user) {
        setError('利用中のアカウントがありません。新規登録してください。');
        return;
      }
      demo.update((draft) => {
        draft.session = { name: user.name, email, role: user.role };
      }, 'ログイン状態を更新しました。');
    } else if (tab === '住所管理') {
      demo.update((draft) => {
        draft.address = {
          postal: text(data, 'postal'),
          address: text(data, 'address'),
          recipient: text(data, 'recipient'),
        };
      }, '住所を更新しました。');
    } else if (tab === 'パスワードリセット' && !resetReady) {
      setResetReady(true);
      demo.setNotice('パスワード再設定の入力画面を表示しました。');
    } else {
      if (password !== text(data, 'confirmation')) {
        setError('確認用パスワードが一致しません。');
        return;
      }
      demo.setNotice('パスワードの入力内容を確認しました。');
      setResetReady(false);
    }
    form.reset();
  }
  function remove() {
    demo.update((draft) => {
      draft.users = draft.users.filter((user) => user.email !== draft.session.email);
      draft.session = { name: '', email: '', role: '' };
    }, 'アカウントを削除しました。');
    setConfirmDelete(false);
  }
  return (
    <>
      {demo.state.session.email && (
        <div className="workspace-card">
          <strong>{demo.state.session.name}</strong> · {demo.state.session.role}
          <button
            onClick={() =>
              demo.update((draft) => {
                draft.session = { name: '', email: '', role: '' };
              }, 'ログアウトしました。')
            }
          >
            ログアウト
          </button>
        </div>
      )}
      <section className="workspace-card">
        <h2>{tab}</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {tab !== '退会' && (
          <form key={`${tab}-${resetReady}`} className="workspace-form" onSubmit={submit}>
            {tab === '新規登録' && (
              <>
                <Field label="お名前・担当者名" name="name" />
                <label>
                  アカウント種別
                  <select name="role">
                    <option>一般</option>
                    <option>事業者</option>
                  </select>
                </label>
              </>
            )}
            {['ログイン', '新規登録', 'パスワードリセット'].includes(tab) && !resetReady && (
              <Field label="メールアドレス" name="email" type="email" />
            )}
            {tab === '住所管理' && (
              <>
                <Field label="受取人" name="recipient" value={demo.state.address.recipient} />
                <Field label="郵便番号" name="postal" value={demo.state.address.postal} />
                <Field label="住所" name="address" value={demo.state.address.address} />
              </>
            )}
            {(['ログイン', '新規登録', 'パスワード変更'].includes(tab) || resetReady) && (
              <Field label="パスワード（8文字以上）" name="password" type="password" />
            )}
            {(tab === 'パスワード変更' || resetReady) && (
              <Field label="確認用パスワード" name="confirmation" type="password" />
            )}
            {resetReady && <p>新しいパスワードを入力してください。</p>}
            <button className="primary-button" type="submit">
              {tab === 'パスワードリセット' && !resetReady ? '再設定メールを送信' : '内容を送信'}
            </button>
          </form>
        )}
        {tab === '退会' && (
          <>
            <p>ログイン中のアカウントを削除します。</p>
            <button disabled={!demo.state.session.email} onClick={() => setConfirmDelete(true)}>
              退会手続きへ
            </button>
            {confirmDelete && (
              <div role="alertdialog" aria-label="退会の確認">
                <p>アカウントを削除しますか？</p>
                <button onClick={remove}>削除を確定</button>
                <button onClick={() => setConfirmDelete(false)}>取消</button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
