import { Field, text } from './Common';

/** @param {{demo:import('./useDemo').Demo}} props */
export function ApplicationPage({ demo }) {
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function apply(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    demo.update((draft) => {
      draft.applications.push({
        id: crypto.randomUUID(),
        company: text(data, 'company'),
        contact: text(data, 'contact'),
        email: text(data, 'email'),
        status: '審査待ち',
        reason: '',
      });
      draft.notices.unshift({
        id: crypto.randomUUID(),
        audience: 'seller',
        title: '出店申請を受け付けました',
        body: '運営の出店審査画面で申請内容を確認できます。',
        read: false,
      });
    }, '出店申請を送信しました。');
    form.reset();
  }
  return (
    <>
      <section className="workspace-card">
        <h2>パートナー出店申請</h2>
        <form className="workspace-form" onSubmit={apply}>
          <Field label="会社・事業者名" name="company" />
          <Field label="担当者名" name="contact" />
          <Field label="連絡先メール" name="email" type="email" />
          <Field label="所在地" name="address" />
          <Field label="電話番号" name="phone" type="tel" />
          <label>
            希望出店プラン
            <select name="plan">
              <option>スタンダード</option>
              <option>生産者直販</option>
            </select>
          </label>
          <label>
            事業確認書類
            <input type="file" accept=".pdf,image/*" />
          </label>
          <label>
            <input type="checkbox" required />
            申請の内容を確認しました
          </label>
          <button className="primary-button">出店を申請</button>
        </form>
      </section>
      <section className="workspace-card">
        <h2>申請状況</h2>
        {demo.state.applications.map((application) => (
          <p key={application.id}>
            {application.company} · <strong>{application.status}</strong> {application.reason}
          </p>
        ))}
      </section>
    </>
  );
}

/** @param {{demo:import('./useDemo').Demo}} props */
export function ProfilePage({ demo }) {
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    demo.update((draft) => {
      draft.profile = {
        name: text(data, 'name'),
        company: text(data, 'company'),
        contact: text(data, 'contact'),
        email: text(data, 'email'),
        address: text(data, 'address'),
        hours: text(data, 'hours'),
        story: text(data, 'story'),
        status: text(data, 'status'),
      };
    }, '店舗プロフィールを更新しました。');
  }
  const profile = demo.state.profile;
  return (
    <>
      <section className="workspace-card">
        <h2>店舗情報・ショッププロフィール</h2>
        <form className="workspace-form" onSubmit={save}>
          <Field label="店舗名" name="name" value={profile.name} />
          <Field label="会社名" name="company" value={profile.company} />
          <Field label="担当者" name="contact" value={profile.contact} />
          <Field label="問い合わせメール" name="email" type="email" value={profile.email} />
          <Field label="所在地" name="address" value={profile.address} />
          <Field label="営業時間" name="hours" value={profile.hours} />
          <label className="full-width">
            園芸ストーリー
            <textarea name="story" defaultValue={profile.story} maxLength={1000} required />
          </label>
          <label>
            営業状態
            <select name="status" defaultValue={profile.status}>
              <option>営業中</option>
              <option>受付休止</option>
            </select>
          </label>
          <button className="primary-button">店舗情報を保存</button>
        </form>
      </section>
    </>
  );
}
