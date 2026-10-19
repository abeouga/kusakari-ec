import { Lightbulb, Thermometer, Check, ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { ChoiceRange, RangeField } from './RangeField';
/** @param {{product:import('../types').Product,onDone:()=>void,onSaved:()=>Promise<unknown>}} props */
export function ProductTipsEditor({ product, onDone, onSaved }) {
  const [tips, setTips] = useState(/** @type {import('../types').ProductTips|null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api
      .productTips(product.id)
      .then((data) => {
        if (alive) setTips(data);
      })
      .catch((reason) => {
        if (alive) setError(reason.message);
      });
    return () => {
      alive = false;
    };
  }, [product.id]);
  /** @param {string} key @param {any} value */
  function set(key, value) {
    setTips((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    if (busy || !tips) return;
    setBusy(true);
    setError('');
    try {
      await api.saveProductTips(product.id, tips);
      await onSaved();
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tipsを保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="basic-form tips-editor" onSubmit={save}>
      <h3>
        <Lightbulb className="seller-ui-icon" size={16} aria-hidden="true" />
        {product.name}：出品者Tips
      </h3>
      <p>出品後に追加する任意の案内です。空欄にして保存すると、その案内を取り下げます。</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!tips && <p>Tipsを読み込んでいます。</p>}
      {tips && (
        <fieldset disabled={busy} className="product-form-content">
          <div className="form-grid">
            {[
              ['care', '水やり・育て方'],
              ['seasonalCare', '季節の育て方'],
              ['styleDescription', '相性のよい庭・空間'],
              ['floweringDescription', '開花・結実'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  name={key}
                  value={String(/** @type {Record<string,any>} */ (tips)[key] ?? '')}
                  onChange={(e) => set(key, e.target.value)}
                  rows={3}
                  maxLength={5000}
                />
              </label>
            ))}
          </div>
          <details>
            <summary>
              <Thermometer className="seller-ui-icon" size={16} aria-hidden="true" />
              温度・植栽条件
            </summary>
            <div className="form-grid">
              <RangeField
                label="耐寒温度（℃）"
                name="minTemperatureC"
                min={-50}
                max={50}
                value={tips.minTemperatureC ?? ''}
                onChange={(v) => set('minTemperatureC', v === '' ? null : Number(v))}
              />
              <label>
                日照条件
                <select value={tips.sunlight} onChange={(e) => set('sunlight', e.target.value)}>
                  {['未設定', '日なた', '半日陰', '日陰'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <ChoiceRange
                label="手入れレベル"
                name="careLevel"
                options={[
                  ['1', '育てやすい'],
                  ['2', '定期的な手入れ'],
                  ['3', 'こまめな手入れ'],
                ]}
                value={String(tips.careLevel)}
                onChange={(v) => set('careLevel', Number(v))}
              />
              <label>
                用途・植栽場所
                <input value={tips.useCase} onChange={(e) => set('useCase', e.target.value)} maxLength={80} />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={tips.heatTolerant}
                  onChange={(e) => set('heatTolerant', e.target.checked)}
                />
                耐暑性が高い
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={tips.droughtTolerant}
                  onChange={(e) => set('droughtTolerant', e.target.checked)}
                />
                乾燥に強い
              </label>
            </div>
          </details>
        </fieldset>
      )}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onDone} disabled={busy}>
          <ArrowLeft className="seller-ui-icon" size={16} aria-hidden="true" />
          商品一覧へ戻る
        </button>
        <button type="submit" className="primary-button" disabled={busy || !tips}>
          <Check className="seller-ui-icon" size={16} aria-hidden="true" />
          {busy ? '保存中…' : 'Tipsを保存'}
        </button>
      </div>
    </form>
  );
}
