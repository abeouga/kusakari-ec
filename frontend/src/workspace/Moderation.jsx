import { useState } from 'react';
import { useResource, write } from './useResource';
import { ConfirmDialog } from '../components/ConfirmDialog';
import './moderation.css';

/**
 * @typedef {{reason:string,createdAt:string}} Warning
 * @typedef {{type:'WARN'|'CLEAR_WARNING'|'SUSPEND'|'RESUME',reason:string,actorName:string,createdAt:string}} ModerationEvent
 * @typedef {'warn'|'clear'|'suspend'|'resume'} Kind
 * @typedef {'products'|'stores'} Target
 */

/** @type {Record<ModerationEvent['type'],string>} */
const eventLabels = { WARN: '警告', CLEAR_WARNING: '警告の解除', SUSPEND: '停止', RESUME: '再開' };

/** @type {Record<Target,{suspend:string,resume:string,suspended:string,resumed:string,suspendText:string,resumeText:string}>} */
const targets = {
  products: {
    suspend: '公開を停止',
    resume: '公開停止を解除',
    suspended: '公開停止',
    resumed: '公開停止の解除',
    suspendText: 'この商品を購入者向けの画面に表示しなくなります。カートに入っていても購入できなくなります。',
    resumeText: '公開停止を解除します。出店者が非表示にしていなければ、購入者向けの画面に再び表示されます。',
  },
  stores: {
    suspend: '利用を停止',
    resume: '利用を再開',
    suspended: '利用停止',
    resumed: '利用再開',
    suspendText:
      'この店舗の利用を停止します。商品は購入者向けの画面に表示されなくなり、出店者は商品・在庫・注文を操作できなくなります。確定済みの注文はキャンセルされません。',
    resumeText: '利用停止を解除し、再び利用できるようにします。',
  },
};

/** @param {string} iso */
const when = (iso) => new Date(iso).toLocaleString('ja-JP');

/**
 * Issue #16: the "warned" badge with the operator's reason, shown to the operator and to the seller; buyers never see it.
 * @param {{warning:Warning|null|undefined}} props
 */
export function WarningBadge({ warning }) {
  if (!warning) return null;
  return (
    <p className="moderation-warning">
      <span className="moderation-badge">警告中</span>
      <span>運営からの警告：{warning.reason}</span>
      <small>（{when(warning.createdAt)}）</small>
    </p>
  );
}

/**
 * Issue #16: the operator warns a product or store with a reason, clears the warning, suspends it from the danger zone
 * (reason and confirmation required) and resumes it from the normal position. Each operation is one history row.
 * @param {{target:Target,id:string|number,name:string,suspended:boolean,warning:Warning|null|undefined,
 * resource:ReturnType<typeof useResource>}} props
 */
export function ModerationControls({ target, id, name, suspended, warning, resource }) {
  const config = targets[target];
  const [pending, setPending] = useState(/** @type {Kind|null} */ (null));
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const base = `/operator/${target}/${encodeURIComponent(String(id))}`;
  const required = pending === 'warn' || pending === 'suspend';
  /** @param {Kind} kind */
  function open(kind) {
    setReason('');
    setMissing(false);
    setPending(kind);
  }
  async function confirm() {
    if (!pending) return;
    if (required && !reason.trim()) {
      setMissing(true);
      return;
    }
    const send = {
      warn: () => write(`${base}/warning`, 'PUT', { warned: true, reason }),
      clear: () => write(`${base}/warning`, 'PUT', { warned: false, reason }),
      suspend: () =>
        target === 'products'
          ? write(`${base}/moderation`, 'PUT', { suspended: true, reason })
          : write(`${base}/enabled`, 'PUT', { enabled: false, reason }),
      resume: () =>
        target === 'products'
          ? write(`${base}/moderation`, 'PUT', { suspended: false, reason })
          : write(`${base}/enabled`, 'PUT', { enabled: true, reason }),
    }[pending];
    const done = {
      warn: '警告しました。出店者に通知しました。',
      clear: '警告を解除しました。出店者に通知しました。',
      suspend: '停止しました。出店者に通知しました。',
      resume: '再開しました。出店者に通知しました。',
    }[pending];
    if (await resource.run(send, done)) setVersion((v) => v + 1);
    setPending(null);
  }
  const titles = {
    warn: { title: '警告の確認', confirm: '警告する' },
    clear: { title: '警告の解除の確認', confirm: '警告を解除する' },
    suspend: { title: `${config.suspended}の確認`, confirm: `${config.suspended}を確定` },
    resume: { title: `${config.resumed}の確認`, confirm: `${config.resumed}を確定` },
  };
  return (
    <div className="moderation">
      <WarningBadge warning={warning} />
      <div className="workspace-actions">
        <button disabled={resource.busy} onClick={() => open('warn')}>
          {warning ? 'もう一度警告する' : '警告する'}
        </button>
        {warning && (
          <button disabled={resource.busy} onClick={() => open('clear')}>
            警告を解除
          </button>
        )}
        {suspended && (
          <button disabled={resource.busy} onClick={() => open('resume')}>
            {config.resume}
          </button>
        )}
      </div>
      <details onToggle={(e) => setHistoryOpen(e.currentTarget.open)}>
        <summary>警告・停止の履歴</summary>
        {historyOpen && <ModerationEvents key={version} path={`${base}/moderation-events`} />}
      </details>
      {!suspended && (
        <section className="danger-zone" aria-label="デンジャーエリア">
          <h4>デンジャーエリア</h4>
          <p>警告をしていなくても、すぐに停止できます。理由は出店者に通知します。</p>
          <button className="danger-button" disabled={resource.busy} onClick={() => open('suspend')}>
            {config.suspend}
          </button>
        </section>
      )}
      {pending && (
        <ConfirmDialog
          title={titles[pending].title}
          confirmLabel={titles[pending].confirm}
          busy={resource.busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        >
          <p>対象：{name}</p>
          {pending === 'warn' && <p>出店者に理由を通知します。公開・利用の状態は変わりません。</p>}
          {pending === 'clear' && <p>警告を解除し、出店者に通知します。</p>}
          {pending === 'suspend' && <p>{config.suspendText}</p>}
          {pending === 'resume' && <p>{config.resumeText}</p>}
          <label>
            {required ? '理由（必須・出店者に通知します）' : '理由（任意・出店者に通知します）'}
            <input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setMissing(false);
              }}
              maxLength={500}
            />
          </label>
          {missing && (
            <p className="error" role="alert">
              理由を入力してください。
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

/** @param {{path:string}} props */
function ModerationEvents({ path }) {
  const resource = useResource(path);
  const events = /** @type {ModerationEvent[]|null} */ (resource.data);
  if (resource.error)
    return (
      <p className="error" role="alert">
        {resource.error}
      </p>
    );
  if (!events) return <p>読み込み中です。</p>;
  if (events.length === 0) return <p>履歴はありません。</p>;
  return (
    <ul className="moderation-events">
      {events.map((event, index) => (
        <li key={index}>
          {when(event.createdAt)} {eventLabels[event.type]}（<span className="moderation-actor">{event.actorName}</span>
          ）{event.reason && `：${event.reason}`}
        </li>
      ))}
    </ul>
  );
}
