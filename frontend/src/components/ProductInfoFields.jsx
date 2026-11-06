import { Ruler, Leaf } from 'lucide-react';
import { useId } from 'react';
import { CategoryPicker } from './CategoryPicker';
import { RangeField } from './RangeField';

/**
 * Step 1 of the product wizard. The product number is assigned by the server and only shown while editing,
 * the plant height lives in the garden-object step, and images have their own step (issues #46, #50).
 * A new product needs at least one in stock; an edited one may go to 0 to mark it sold out (issue #72).
 * @param {{storeSelector?:import('react').ReactNode,p:Record<string, any>,set:(name:string,value:any)=>void,stockError?:string}} props
 */
export function ProductInfoFields({ p, set, storeSelector, stockError = '' }) {
  const skuLabel = useId();
  const stockErrorId = useId();
  /** @param {import('react').ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>} event */
  function change(event) {
    const el = event.target;
    set(el.name, el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value);
  }
  return (
    <>
      <div className="product-info-main">
        <div className="form-grid">
          <label>
            <span className="required-label">商品名</span>
            <input name="name" value={p.name} required maxLength={120} onChange={change} />
          </label>
          {p.id && (
            <div className="readonly-field">
              <span id={skuLabel}>商品番号</span>
              <output aria-labelledby={skuLabel}>{p.sku}</output>
              <small className="muted">商品番号は変更できません。</small>
            </div>
          )}
          <CategoryPicker value={p.category} onChange={(value) => set('category', value)} />
          <label className="form-full">
            <span className="required-label">商品説明</span>
            <textarea name="description" value={p.description} required rows={2} maxLength={5000} onChange={change} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span className="required-label">税込価格（円）</span>
            <input
              name="priceYen"
              type="number"
              min="1"
              max="100000"
              step="1"
              required
              value={p.priceYen}
              onChange={change}
            />
          </label>
          <div className="stock-field">
            <label>
              <span className="required-label">選択店舗の在庫</span>
              <input
                name="stock"
                type="number"
                min={p.id ? 0 : 1}
                max="10000"
                step="1"
                required
                value={p.stock}
                aria-invalid={stockError ? true : undefined}
                aria-describedby={stockError ? stockErrorId : undefined}
                onChange={change}
              />
            </label>
            {stockError && (
              <small id={stockErrorId} className="field-error">
                {stockError}
              </small>
            )}
          </div>
          {storeSelector}
        </div>
      </div>
      <details className="product-options">
        <summary>
          <Ruler className="seller-ui-icon" size={16} aria-hidden="true" />
          サイズ
        </summary>
        <p className="fine-print">植物の高さは「庭オブジェクト」で入力します。</p>
        <div className="form-grid">
          <RangeField
            label="樹齢目安（年）"
            name="ageYears"
            min={0}
            max={1000}
            value={p.ageYears}
            onChange={(value) => set('ageYears', value)}
          />
          <RangeField
            label="鉢径（cm）"
            name="potDiameterCm"
            min={1}
            max={300}
            value={p.potDiameterCm}
            onChange={(value) => set('potDiameterCm', value)}
          />
        </div>
      </details>
      <details className="product-options">
        <summary>
          <Leaf className="seller-ui-icon" size={16} aria-hidden="true" />
          詳しい情報
        </summary>
        <div className="form-grid">
          <label>
            生産者名
            <input name="nurseryName" value={p.nurseryName} maxLength={100} onChange={change} />
          </label>
          <label>
            学名
            <input name="latinName" value={p.latinName} maxLength={120} onChange={change} />
          </label>
          <label>
            科名・属名
            <input name="familyName" value={p.familyName} maxLength={100} onChange={change} />
          </label>
        </div>
      </details>
    </>
  );
}
