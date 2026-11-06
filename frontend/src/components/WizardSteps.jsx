import { Check } from 'lucide-react';

/**
 * Progress bar for the product wizard (issue #45). A new product moves only with 「次へ」「戻る」, so the
 * steps are plain text; while editing, each step stays a tab-like button that switches the page.
 * @param {{labels:string[],step:number,editing:boolean,disabled:boolean,onSelect:(index:number)=>void}} props
 */
export function WizardSteps({ labels, step, editing, disabled, onSelect }) {
  return (
    <nav className="wizard-steps" aria-label={editing ? '商品編集のタブ' : '出品の手順'}>
      <ol data-mode={editing ? 'tabs' : 'progress'}>
        {labels.map((label, index) => {
          const current = index === step;
          const state = current ? 'current' : !editing && index < step ? 'done' : 'todo';
          const content = (
            <>
              <span className="wizard-step-number" aria-hidden="true">
                {state === 'done' ? <Check size={12} strokeWidth={3} /> : index + 1}
              </span>
              <span className="wizard-step-label">{label}</span>
              {state === 'done' && <span className="visually-hidden">（完了）</span>}
            </>
          );
          return (
            <li key={label} data-state={state} aria-current={!editing && current ? 'step' : undefined}>
              {editing ? (
                <button
                  type="button"
                  aria-current={current ? 'step' : undefined}
                  disabled={disabled}
                  onClick={() => onSelect(index)}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
