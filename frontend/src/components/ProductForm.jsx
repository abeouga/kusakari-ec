import { ArrowLeft, ArrowRight, Check, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PlantModelFields } from './PlantModelFields';
import { RangeField } from './RangeField';
import { usePlantSuggestion } from './usePlantSuggestion';
import { PlantSuggestionControls } from './PlantSuggestionControls';
import { ProductInfoFields } from './ProductInfoFields';
import { ProductReview } from './ProductReview';
import { emptyProduct, createDraft, productInput } from '../productDraft';

/** @param {{product:import('../types').Product|null,storeId:number,storeName?:string,storeSelector?:import('react').ReactNode,busy:boolean,onSave:(id:string,input:import('../types').ProductInput)=>Promise<boolean|undefined>,onDone:()=>void}} props */
export function ProductForm({ product, storeId, storeName, storeSelector, busy, onSave, onDone }) {
  const [draft, setDraft] = useState(() => createDraft(product ?? emptyProduct));
  const plant = usePlantSuggestion(product ?? emptyProduct, !!product);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const formRef = useRef(/** @type {HTMLFormElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const saving = useRef(false);
  const positioned = useRef(false);
  useEffect(() => {
    if (!busy && !positioned.current) {
      positioned.current = true;
      if (window.matchMedia('(max-width:700px)').matches) formRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [busy]);

  const [imageBusy, setImageBusy] = useState(false);
  const locked = busy || plant.busy || imageBusy;
  const labels = product ? ['商品情報', '庭オブジェクト'] : ['商品情報', '庭オブジェクト', '確認'];
  const values = { ...draft, heightCm: plant.height };
  /** @param {string} name @param {any} value */
  function set(name, value) {
    setDraft((prev) => ({ ...prev, [name]: value }));
  }
  /** @param {number} next */
  function move(next) {
    setStep(next);
    setError('');
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      formRef.current?.scrollIntoView({ block: 'start' });
    });
  }
  /** @param {HTMLElement} element */
  function reveal(element) {
    const panel = element.closest('[data-step]');
    setStep(Number(panel?.getAttribute('data-step') ?? 0));
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    requestAnimationFrame(() => {
      element.focus();
      element.scrollIntoView({ block: 'center' });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.reportValidity();
    });
  }
  /** @param {number|null} scope */
  function validate(scope) {
    const root = scope === null ? formRef.current : formRef.current?.querySelector(`[data-step="${scope}"]`);
    const invalid = root?.querySelector('input:invalid,select:invalid,textarea:invalid');
    if (invalid instanceof HTMLElement) {
      setError('入力内容を確認してください。');
      reveal(invalid);
      return false;
    }
    if (scope === 0 || scope === null) {
      for (const name of ['name', 'sku', 'description']) {
        if (!String(draft[name]).trim()) {
          setError('商品名・商品番号・説明を入力してください。');
          const field = formRef.current?.querySelector(`[name="${name}"]`);
          if (field instanceof HTMLElement) reveal(field);
          return false;
        }
      }
      if (!draft.imageUrl) {
        setError('商品画像を1枚以上追加してください。');
        const field = formRef.current?.querySelector('input[type="file"]');
        if (field instanceof HTMLElement) reveal(field);
        return false;
      }
    }
    if (scope === 1 || scope === null) {
      try {
        plant.currentProfile();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '植物情報を確認してください。');
        const field = formRef.current?.querySelector('[name="modelHeight"]');
        if (field instanceof HTMLElement) reveal(field);
        return false;
      }
    }
    return true;
  }
  function next() {
    if (validate(step)) move(step + 1);
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    if (locked || saving.current) return;
    if (!product && step !== 2) {
      next();
      return;
    }
    if (!validate(null)) return;
    saving.current = true;
    try {
      const saved = await onSave(product?.id ?? '', productInput(values, storeId, plant.currentProfile()));
      if (saved) onDone();
    } finally {
      saving.current = false;
    }
  }
  return (
    <form
      ref={formRef}
      className="basic-form product-form product-wizard"
      onSubmit={save}
      onChange={() => setError('')}
      noValidate
    >
      <nav className="wizard-steps" aria-label={product ? '商品編集のタブ' : '出品の手順'}>
        {labels.map((label, index) => (
          <button
            type="button"
            key={label}
            aria-current={step === index ? 'step' : undefined}
            disabled={locked || (!product && index > step)}
            onClick={() => move(index)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <h3 ref={heading} tabIndex={-1} className="wizard-heading">
        {labels[step]}
      </h3>
      <fieldset disabled={locked} className="product-form-content">
        <section data-step="0" hidden={step !== 0} aria-label="商品情報">
          <ProductInfoFields
            p={values}
            set={set}
            plant={plant}
            storeSelector={storeSelector}
            onImageBusy={setImageBusy}
          />
        </section>
        <section data-step="1" hidden={step !== 1} aria-label="庭オブジェクト">
          <div className="model-layout">
            <div className="model-preview-pane">
              {plant.previewUrl ? (
                <iframe className="plant-model-preview" title="植物の3Dプレビュー" src={plant.previewUrl} />
              ) : (
                <div className="preview-placeholder">
                  {plant.enabled
                    ? '設定後に「植物のプレビューを確認」を押してください。'
                    : 'AIまたは手動で設定すると、ここで形を確認できます。'}
                </div>
              )}
            </div>
            <div>
              <PlantSuggestionControls plant={plant} imageUrl={draft.imageUrl} editing={!!product} draft={values} />
              {!plant.enabled && (
                <button type="button" className="secondary-button" onClick={() => plant.setEnabled(true)}>
                  <SlidersHorizontal className="seller-ui-icon" size={16} aria-hidden="true" />
                  手動で設定
                </button>
              )}
              <PlantModelFields
                profile={plant.profile}
                enabled={plant.enabled}
                onEnabledChange={plant.setEnabled}
                onChange={plant.changeProfile}
                onPreview={plant.preview}
                heightControl={
                  plant.enabled && (
                    <>
                      <RangeField
                        label="植物の高さ（cm・土際から）"
                        name="modelHeight"
                        min={10}
                        max={1500}
                        value={plant.height}
                        onChange={plant.setHeight}
                        required
                      />
                      {plant.estimated && <p className="ai-estimate">AI推定・実寸未確認。高さを確認してください。</p>}
                    </>
                  )
                }
              >
                {null}
              </PlantModelFields>
            </div>
          </div>
        </section>
        {step === 2 && (
          <ProductReview draft={values} plant={plant} storeName={storeName ?? String(storeId)} onEdit={move} />
        )}
      </fieldset>
      <div className="wizard-footer">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="wizard-actions">
          <span>{product ? '商品を編集' : `${step + 1} / 3`}</span>
          {step > 0 && (
            <button type="button" className="secondary-button" disabled={locked} onClick={() => move(step - 1)}>
              <ArrowLeft className="seller-ui-icon" size={16} aria-hidden="true" />
              戻る
            </button>
          )}
          {!product && step === 1 && (
            <button
              type="button"
              className="text-button"
              disabled={locked}
              onClick={() => {
                plant.setEnabled(false);
                move(2);
              }}
            >
              設定せず次へ
            </button>
          )}
          {product || step === 2 ? (
            <button key="save" type="submit" className="primary-button" disabled={locked}>
              <Check className="seller-ui-icon" size={16} aria-hidden="true" />
              {busy ? '保存中…' : product ? '変更を保存' : '出品する'}
            </button>
          ) : (
            <button key="next" type="button" className="primary-button" disabled={locked} onClick={next}>
              次へ
              <ArrowRight className="seller-ui-icon" size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
