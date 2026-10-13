import { useState } from 'react';
import { DataTable, Field, MockNote, text } from './Common';

/** @param {{demo:import('./useDemo').Demo,products?:boolean}} props */
export function ReviewPage({ demo, products = false }) {
  const [reason, setReason] = useState('');
  /** @param {string} id @param {string} status */
  function review(id, status) {
    if (status === '却下' && !reason.trim()) {
      demo.setNotice('却下・差戻し理由を入力してください。');
      return;
    }
    demo.update((draft) => {
      const records = products ? draft.reviews : draft.applications;
      const record = records.find((entry) => entry.id === id);
      if (!record) return;
      record.status = status;
      record.reason = reason.trim();
      draft.notices.unshift({
        id: crypto.randomUUID(),
        audience: 'seller',
        title: `${products ? '商品' : '出店'}審査：${status}`,
        body: reason.trim() || '申請が承認されました。',
        read: false,
      });
    }, '審査結果を反映しました（モック）。');
  }
  const rows = products
    ? demo.state.reviews.map((record) => ({
        id: record.id,
        name: record.name,
        person: record.seller,
        status: record.status,
        reason: record.reason,
      }))
    : demo.state.applications.map((record) => ({
        id: record.id,
        name: record.company,
        person: record.contact,
        status: record.status,
        reason: record.reason,
      }));
  return (
    <>
      <MockNote>承認・却下はサンプル内だけに反映します。実商品の公開状態は変更しません。</MockNote>
      <section className="workspace-card">
        <h2>{products ? '商品審査' : '出店審査・承認'}</h2>
        <label>
          審査コメント・却下理由
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={250} />
        </label>
        <DataTable
          headers={['申請内容', '担当・出店者', '状態', '理由', '審査']}
          rows={rows.map((record) => [
            record.name,
            record.person,
            record.status,
            record.reason,
            <div key={record.id} className="workspace-actions">
              <button onClick={() => review(record.id, '承認済み')}>承認</button>
              <button onClick={() => review(record.id, '却下')}>却下</button>
            </div>,
          ])}
        />
      </section>
    </>
  );
}

/** @param {{demo:import('./useDemo').Demo,sellers?:boolean}} props */
export function MembersPage({ demo, sellers = false }) {
  const [query, setQuery] = useState('');
  const users = demo.state.users.filter(
    (user) => (!sellers || user.role === '事業者') && `${user.name} ${user.email}`.includes(query),
  );
  /** @param {string} id */
  function toggle(id) {
    demo.update((draft) => {
      const user = draft.users.find((entry) => entry.id === id);
      if (!user) return;
      if (user.status === '利用中') user.status = '利用停止';
      else user.status = '利用中';
    }, 'モックの利用状態を変更しました。実APIのアクセス権は変更していません。');
  }
  return (
    <>
      <MockNote>会員・出店者の利用状態を管理するサンプルです。</MockNote>
      <section className="workspace-card">
        <h2>{sellers ? '出店者情報・利用状態' : '会員管理'}</h2>
        <label>
          氏名・メール検索
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <DataTable
          headers={['名前', 'メール', '区分', '利用状態', '操作']}
          rows={users.map((user) => [
            user.name,
            user.email,
            user.role,
            user.status,
            <button key={user.id} onClick={() => toggle(user.id)}>
              利用状態を切り替え
            </button>,
          ])}
        />
      </section>
      {sellers && (
        <section className="workspace-card">
          <h2>出店申請・審査状況</h2>
          {demo.state.applications.map((entry) => (
            <p key={entry.id}>
              {entry.company} / {entry.status} / {entry.reason}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

/** @param {{demo:import('./useDemo').Demo}} props */
export function CategoriesPage({ demo }) {
  const [editing, setEditing] = useState('');
  const [deleting, setDeleting] = useState('');
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function save(event) {
    event.preventDefault();
    const value = text(new FormData(event.currentTarget), 'category');
    if (demo.state.categories.includes(value) && value !== editing) {
      demo.setNotice('同じカテゴリ名があります。');
      return;
    }
    demo.update((draft) => {
      if (editing) draft.categories = draft.categories.map((entry) => (entry === editing ? value : entry));
      else draft.categories.push(value);
    }, 'カテゴリを更新しました（モック）。実商品カテゴリは変更していません。');
    setEditing('');
    event.currentTarget.reset();
  }
  return (
    <>
      <MockNote>カテゴリ管理のサンプルです。</MockNote>
      <section className="workspace-card">
        <h2>商品カテゴリ管理</h2>
        <form key={editing} className="workspace-form" onSubmit={save}>
          <Field label="カテゴリ名" name="category" value={editing} />
          <button>{editing ? '変更を保存' : 'カテゴリを追加'}</button>
          <button type="button" onClick={() => setEditing('')}>
            取消
          </button>
        </form>
        <DataTable
          headers={['カテゴリ', '操作']}
          rows={demo.state.categories.map((category) => [
            category,
            <div key={category} className="workspace-actions">
              <button onClick={() => setEditing(category)}>編集</button>
              <button onClick={() => setDeleting(category)}>削除</button>
            </div>,
          ])}
        />
        {deleting && (
          <div role="alertdialog" aria-label="カテゴリ削除の確認">
            <p>「{deleting}」をモック一覧から削除しますか？</p>
            <button
              onClick={() => {
                demo.update((draft) => {
                  draft.categories = draft.categories.filter((entry) => entry !== deleting);
                }, 'カテゴリを削除しました。');
                setDeleting('');
              }}
            >
              削除を確定
            </button>
            <button onClick={() => setDeleting('')}>取消</button>
          </div>
        )}
      </section>
    </>
  );
}
