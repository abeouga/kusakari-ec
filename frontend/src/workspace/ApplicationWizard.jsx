import { Fragment, useRef, useState } from 'react';
import { ApiError, readResponse, send } from '../api';

export const fields = /** @type {const} */ ([
  ['company', '会社・事業者名', 'text', 100],
  ['contact', '担当者名', 'text', 100],
  ['email', '連絡先メール', 'email', 200],
  ['address', '所在地', 'text', 200],
  ['phone', '電話番号', 'tel', 30],
]);
/** @type {Record<string,string>} */
export const plans = { STANDARD: 'スタンダード', PRODUCER: '生産者直販' };

/** Issue #20: one kind of information per step; the last step is the existing confirmation. */
const steps = [
  { title: '事業者情報', names: ['company', 'address'] },
  { title: '担当者・連絡先', names: ['contact', 'email', 'phone'] },
  { title: '出店プラン', names: ['plan'] },
  { title: '事業確認書類', names: ['document'] },
];
const reviewStep = steps.length;
const labelOf = Object.fromEntries(fields.map(([name, label]) => [name, label]));

/** @param {{application:Record<string,string>,documentName:string}} props */
export function Summary({ application, documentName }) {
  return (
    <dl className="application-summary">
      {fields.map(([name, label]) => (
        <Fragment key={name}>
          <dt>{label}</dt>
          <dd>{application[name]}</dd>
        </Fragment>
      ))}
      <dt>希望出店プラン</dt>
      <dd>{plans[application.plan] || application.plan}</dd>
      <dt>事業確認書類</dt>
      <dd>{documentName}</dd>
    </dl>
  );
}

/** EC-B17 7a/7b, checked only for the fields of one step. @param {number} step @param {FormData} data */
function stepError(step, data) {
  const text = (/** @type {string} */ name) => String(data.get(name) || '').trim();
  const file = data.get('document');
  const missing = steps[step].names
    .filter((name) => (name === 'document' ? !(file instanceof File) || !file.name : !text(name)))
    .map((name) => (name === 'document' ? '事業確認書類' : name === 'plan' ? '希望出店プラン' : labelOf[name]));
  if (missing.length) return `未入力の項目があります：${missing.join('、')}`;
  if (step === 1 && !/^[^\s@]+@[^\s@]+$/.test(text('email'))) return '連絡先メールの形式が正しくありません。';
  if (step === 1 && !/^[0-9+() -]{1,30}$/.test(text('phone')))
    return '電話番号は数字・＋・括弧・ハイフンで入力してください。';
  if (step === 3 && file instanceof File && file.size > 5 * 1024 * 1024)
    return '事業確認書類は5MB以内のファイルを選択してください。';
  return '';
}

/** Inputs stay mounted while hidden, so going back or editing from the review keeps them (the file too).
 * Nothing is sent until 申請する.
 * @param {{previous:Record<string,string>|null,onDone:()=>void}} props */
export function ApplicationWizard({ previous, onDone }) {
  const form = useRef(/** @type {HTMLFormElement|null} */ (null));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(/** @type {{input:Record<string,string>,documentName:string}|null} */ (null));
  /** @param {number} next */
  function go(next) {
    setError('');
    setStep(next);
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function next(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = stepError(step, data);
    if (message) return setError(message);
    if (step + 1 < reviewStep) return go(step + 1);
    const input = Object.fromEntries(
      [...fields.map(([name]) => name), 'plan'].map((name) => [name, String(data.get(name) || '').trim()]),
    );
    const file = data.get('document');
    setDraft({ input, documentName: file instanceof File ? file.name : '' });
    go(reviewStep);
  }
  async function submit() {
    if (!draft || !form.current) return;
    const file = new FormData(form.current).get('document');
    const body = new FormData();
    body.append('application', new Blob([JSON.stringify(draft.input)], { type: 'application/json' }));
    if (file instanceof File) body.append('document', file);
    setBusy(true);
    setError('');
    try {
      await readResponse(
        await send('/api/account/store-applications', { method: 'POST', body }),
        '申請を保存できませんでした。',
      );
      onDone();
    } catch (reason) {
      // 4a/4b: the server rejected the input, so show the first step again with what was entered.
      if (reason instanceof ApiError && reason.status === 400) setStep(0);
      setError(reason instanceof Error ? reason.message : '申請を保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  const titles = [...steps.map((s) => s.title), '入力内容の確認'];
  return (
    <section className="workspace-card application-wizard">
      <ol className="application-steps" aria-label="出店申請の手順">
        {titles.map((title, index) => (
          <li
            key={title}
            aria-current={index === step ? 'step' : undefined}
            className={index < step ? 'is-done' : index === step ? 'is-current' : ''}
          >
            <span>{index + 1}</span>
            {title}
          </li>
        ))}
      </ol>
      <p className="application-step-count">
        ステップ {step + 1} / {titles.length}：{titles[step]}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {previous && step === 0 && <p>前回の申請内容を入力しています。事業確認書類はもう一度選択してください。</p>}
      <form ref={form} className="workspace-form" onSubmit={next} hidden={step === reviewStep} noValidate>
        {steps.map((s, index) => (
          <fieldset key={s.title} hidden={index !== step}>
            <legend>{s.title}</legend>
            {s.names.map((name) => {
              const field = fields.find(([fieldName]) => fieldName === name);
              if (field)
                return (
                  <label key={name}>
                    {field[1]}
                    <input
                      name={name}
                      type={field[2]}
                      defaultValue={previous?.[name] ?? ''}
                      required
                      maxLength={field[3]}
                    />
                  </label>
                );
              if (name === 'plan')
                return (
                  <label key={name}>
                    希望出店プラン
                    <select name="plan" defaultValue={previous?.plan ?? 'STANDARD'}>
                      {Object.entries(plans).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              return (
                <label key={name}>
                  事業確認書類（PDF・PNG・JPEG、5MB以内）
                  <input name="document" type="file" accept="application/pdf,image/png,image/jpeg" required />
                </label>
              );
            })}
          </fieldset>
        ))}
        <div className="workspace-actions">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)}>
              戻る
            </button>
          )}
          <button>{step + 1 === reviewStep ? '確認画面へ' : '次へ'}</button>
        </div>
      </form>
      {step === reviewStep && draft && (
        <section aria-label="入力内容の確認">
          <h2>入力内容の確認</h2>
          <p>この内容で出店を申請します。よろしければ「申請する」を選んでください。</p>
          <Summary application={draft.input} documentName={draft.documentName} />
          <div className="workspace-actions">
            {steps.map((s, index) => (
              <button key={s.title} type="button" disabled={busy} onClick={() => go(index)}>
                {s.title}を修正
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? '申請しています…' : '申請する'}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
