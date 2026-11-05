import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePlantSuggestion } from './usePlantSuggestion';
import { ProductGardenStep } from './ProductGardenStep';
import { ProductImages } from './ProductImages';
import { ProductInfoFields } from './ProductInfoFields';
import { ProductReview } from './ProductReview';
import { WizardSteps } from './WizardSteps';
import { emptyProduct, createDraft, productInput } from '../productDraft';

const INFO = 0;
const IMAGES = 1;
const GARDEN = 2;
const REVIEW = 3;

/** @param {{product:import('../types').Product|null,storeId:number,storeName?:string,storeSelector?:import('react').ReactNode,busy:boolean,onSave:(id:string,input:import('../types').ProductInput)=>Promise<boolean|undefined>,onDone:()=>void}} props */
export function ProductForm({ product, storeId, storeName, storeSelector, busy, onSave, onDone }) {
  const [draft, setDraft] = useState(() => createDraft(product ?? emptyProduct));
  const plant = usePlantSuggestion(product ?? emptyProduct, !!product);
  const [step, setStep] = useState(INFO);
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
  // Issue #46: images have their own step before the garden object, whose AI estimate uses the main image.
  const labels = product ? ['商品情報', '画像', '庭オブジェクト'] : ['商品情報', '画像', '庭オブジェクト', '確認'];
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
    setStep(Number(panel?.getAttribute('data-step') ?? INFO));
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    requestAnimationFrame(() => {
      element.focus();
      element.scrollIntoView({ block: 'center' });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.reportValidity();
    });
  }
  /** @param {string} message @param {Element|null|undefined} field */
  function fail(message, field) {
    setError(message);
    if (field instanceof HTMLElement) reveal(field);
    return false;
  }
  /** @param {number|null} scope */
  function validate(scope) {
    const form = formRef.current;
    const root = scope === null ? form : form?.querySelector(`[data-step="${scope}"]`);
    const invalid = root?.querySelector('input:invalid,select:invalid,textarea:invalid');
    if (invalid) return fail('入力内容を確認してください。', invalid);
    if (scope === INFO || scope === null) {
      // The product number is never typed: the server assigns it on registration (issue #46).
      for (const name of ['name', 'description'])
        if (!String(draft[name]).trim())
          return fail('商品名・説明を入力してください。', form?.querySelector(`[name="${name}"]`));
    }
    if ((scope === IMAGES || scope === null) && !draft.imageUrl)
      return fail('商品画像を1枚以上追加してください。', form?.querySelector('input[type="file"]'));
    if (scope === GARDEN || scope === null) {
      try {
        plant.currentProfile();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '植物情報を確認してください。';
        return fail(message, form?.querySelector('[name="modelHeight"]'));
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
    if (!product && step !== REVIEW) {
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
      <WizardSteps labels={labels} step={step} editing={!!product} disabled={locked} onSelect={move} />
      <h3 ref={heading} tabIndex={-1} className="wizard-heading">
        {labels[step]}
      </h3>
      <fieldset disabled={locked} className="product-form-content">
        <section data-step={INFO} hidden={step !== INFO} aria-label="商品情報">
          <ProductInfoFields p={values} set={set} storeSelector={storeSelector} />
        </section>
        <section data-step={IMAGES} hidden={step !== IMAGES} aria-label="画像">
          <ProductImages
            main={draft.imageUrl}
            extra={draft.images}
            onBusy={setImageBusy}
            onChange={(main, extra) => {
              set('imageUrl', main);
              set('images', extra);
            }}
          />
        </section>
        <section data-step={GARDEN} hidden={step !== GARDEN} aria-label="庭オブジェクト">
          <ProductGardenStep plant={plant} draft={values} editing={!!product} />
        </section>
        {step === REVIEW && (
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
          <span>{product ? '商品を編集' : `${step + 1} / ${labels.length}`}</span>
          {step > INFO && (
            <button type="button" className="secondary-button" disabled={locked} onClick={() => move(step - 1)}>
              <ArrowLeft className="seller-ui-icon" size={16} aria-hidden="true" />
              戻る
            </button>
          )}
          {!product && step === GARDEN && (
            <button
              type="button"
              className="text-button"
              disabled={locked}
              onClick={() => {
                plant.setEnabled(false);
                move(REVIEW);
              }}
            >
              設定せず次へ
            </button>
          )}
          {product || step === REVIEW ? (
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
