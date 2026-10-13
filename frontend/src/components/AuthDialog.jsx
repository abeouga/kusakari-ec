import { useState } from 'react';
import { Dialog } from './Dialog';
import '../css/auth-dialog.css';

const choices = [
  { id: 'login', label: 'ログイン' },
  { id: 'buyer', label: '新規アカウント作成' },
  { id: 'seller', label: '出店者用アカウント作成' },
];

/** @param {{onClose:()=>void}} props */
export function AuthDialog({ onClose }) {
  const [mode, setMode] = useState('login');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  let title = 'ログイン';
  let buttonLabel = 'ログイン';
  if (mode === 'buyer') {
    title = '新規アカウント作成';
    buttonLabel = 'アカウントを作成';
  }
  if (mode === 'seller') {
    title = '出店者用アカウント作成';
    buttonLabel = '出店者用アカウントを作成';
  }

  /** @param {string} nextMode */
  function selectMode(nextMode) {
    setMode(nextMode);
    setMessage('');
    setError('');
  }

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage('');
    setError('');
    if (mode !== 'login' && data.get('password') !== data.get('confirmation')) {
      setError('確認用パスワードが一致しません。');
      return;
    }
    form.reset();
    setMessage(`${title}の入力内容を確認しました。`);
  }

  return (
    <Dialog title="ログイン・アカウント作成" onClose={onClose}>
      <div className="auth-dialog">
        <fieldset className="auth-segments">
          <legend>手続きを選択</legend>
          {choices.map((choice) => (
            <label key={choice.id}>
              <input
                type="radio"
                name="auth-mode"
                value={choice.id}
                checked={mode === choice.id}
                onChange={() => selectMode(choice.id)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </fieldset>
        <form key={mode} className="auth-form" onSubmit={submit}>
          <h3>{title}</h3>
          {mode === 'seller' && (
            <label>
              会社・屋号
              <input name="company" autoComplete="organization" required maxLength={100} />
            </label>
          )}
          {mode !== 'login' && (
            <label>
              {mode === 'seller' ? '担当者名' : 'お名前'}
              <input name="name" autoComplete="name" required maxLength={100} />
            </label>
          )}
          <label>
            メールアドレス
            <input name="email" type="email" autoComplete="email" required maxLength={250} />
          </label>
          <label>
            パスワード（8文字以上）
            <input name="password" type="password" autoComplete="off" required minLength={8} maxLength={128} />
          </label>
          {mode !== 'login' && (
            <label>
              パスワード（確認）
              <input name="confirmation" type="password" autoComplete="off" required minLength={8} maxLength={128} />
            </label>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="auth-success" role="status">
              {message}
            </p>
          )}
          <button className="auth-submit" type="submit">
            {buttonLabel}
          </button>
        </form>
      </div>
    </Dialog>
  );
}
