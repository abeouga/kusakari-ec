import { useState } from 'react';
import { Field, MockNote, text } from './Common';

/** @param {{demo:import('./useDemo').Demo}} props */
export function AccountPage({ demo }) {
  const [tab, setTab] = useState('ログイン');
  const [resetReady, setResetReady] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tabs = ['ログイン', '新規登録', '住所管理', 'パスワード変更', 'パスワードリセット', '退会'];
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
      }, 'デモアカウントを作成しました。パスワードは保存していません。');
    } else if (tab === 'ログイン') {
      const user = demo.state.users.find((entry) => entry.email === email && entry.status === '利用中');
      if (!user) {
        setError('利用中のデモアカウントがありません。新規登録してください。');
        return;
      }
      demo.update((draft) => {
        draft.session = { name: user.name, email, role: user.role };
      }, 'デモログインしました。パスワード照合・認証は行っていません。');
    } else if (tab === '住所管理') {
      demo.update((draft) => {
        draft.address = {
          postal: text(data, 'postal'),
          address: text(data, 'address'),
          recipient: text(data, 'recipient'),
        };
      }, 'モックの住所を更新しました。実カートの配送先は変更していません。');
    } else if (tab === 'パスワードリセット' && !resetReady) {
      setResetReady(true);
      demo.setNotice('再設定メールの送信完了画面です。実際のメールは送信しません。');
    } else {
      if (password !== text(data, 'confirmation')) {
        setError('確認用パスワードが一致しません。');
        return;
      }
      demo.setNotice('パスワード更新の操作を確認しました。入力値は保存していません。');
      setResetReady(false);
    }
    form.reset();
  }
  function remove() {
    demo.update((draft) => {
      draft.users = draft.users.filter((user) => user.email !== draft.session.email);
      draft.session = { name: '', email: '', role: '' };
    }, 'モックのアカウントを削除しました。実注文・庭データは保持されています。');
    setConfirmDelete(false);
  }
  return (
    <>
      <MockNote>認証・メール送信・権限のサンプルです。</MockNote>
      <div className="workspace-tabs">
        {tabs.map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => {
              setTab(item);
              setError('');
              setResetReady(false);
            }}
          >
            {item}
          </button>
        ))}
      </div>
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
        {tab === 'ログイン' && (
          <p>デモ用：buyer@example.jp / seller@example.jp。任意の8文字以上の入力で操作を確認できます。</p>
        )}
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
            {resetReady && <p>デモ用再設定リンクを開いた状態です。新しいパスワードを入力してください。</p>}
            <button className="primary-button" type="submit">
              {tab === 'パスワードリセット' && !resetReady ? '再設定メールを送信（デモ）' : '内容を送信'}
            </button>
          </form>
        )}
        {tab === '退会' && (
          <>
            <p>デモログイン中のアカウントを削除します。</p>
            <button disabled={!demo.state.session.email} onClick={() => setConfirmDelete(true)}>
              退会手続きへ
            </button>
            {confirmDelete && (
              <div role="alertdialog" aria-label="退会の確認">
                <p>モックアカウントを削除しますか？</p>
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
