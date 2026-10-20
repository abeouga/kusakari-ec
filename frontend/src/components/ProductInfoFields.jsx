import { useResource } from '../workspace/useResource';
import { Ruler, Leaf } from 'lucide-react';
import { ProductImages } from './ProductImages';
import { RangeField } from './RangeField';
/** @param {{onImageBusy:(busy:boolean)=>void,storeSelector?:import('react').ReactNode,p:Record<string, any>,set:(name:string,value:any)=>void,plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>}} props */
export function ProductInfoFields({ p, set, plant, storeSelector, onImageBusy }) {
  const categories = useResource('/categories');
  /** @param {import('react').ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>} event */
  function change(event) {
    const el = event.target;
    set(el.name, el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value);
  }
  return (
    <>
      <div className="product-info-layout">
        <div className="product-info-main">
          <div className="form-grid">
            <label>
              商品名
              <input name="name" value={p.name} required maxLength={120} onChange={change} />
            </label>
            <label>
              商品番号
              <input name="sku" value={p.sku} required maxLength={50} onChange={change} />
            </label>
            <label>
              カテゴリー
              <select name="category" disabled={!categories.data} value={p.category} onChange={change}>
                {
                  /** @type {string[]} */ (categories.data || [p.category]).map((name) => (
                    <option key={name}>{name}</option>
                  ))
                }
              </select>
            </label>
            <label className="form-full">
              商品説明
              <textarea name="description" value={p.description} required rows={2} maxLength={5000} onChange={change} />
            </label>
          </div>

          <div className="form-grid">
            <label>
              税込価格（円）
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
            <label>
              選択店舗の在庫
              <input
                name="stock"
                type="number"
                min="0"
                max="10000"
                step="1"
                required
                value={p.stock}
                onChange={change}
              />
            </label>
            {storeSelector}
          </div>
        </div>
        <aside className="wizard-photo">
          <ProductImages
            main={p.imageUrl}
            extra={p.images}
            onBusy={onImageBusy}
            onChange={(main, extra) => {
              set('imageUrl', main);
              set('images', extra);
            }}
          />
        </aside>
      </div>
      <details className="product-options">
        <summary>
          <Ruler className="seller-ui-icon" size={16} aria-hidden="true" />
          サイズ
        </summary>

        <div className="form-grid">
          <RangeField
            label="樹齢目安（年）"
            name="ageYears"
            min={0}
            max={1000}
            value={p.ageYears}
            onChange={(value) => set('ageYears', value)}
          />
          <div>
            <RangeField
              label="植物の高さ（cm・土際から）"
              name="heightCm"
              min={1}
              max={3000}
              value={plant.height}
              onChange={plant.setHeight}
            />
            {plant.estimated && (
              <p className="ai-estimate" role="status">
                AI推定・実寸未確認。保存前に高さを確認してください。
              </p>
            )}
            {plant.enabled && plant.height !== '' && (Number(plant.height) < 10 || Number(plant.height) > 1500) && (
              <p className="error">庭オブジェクトの高さは10〜1500cmにしてください。</p>
            )}
          </div>
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
