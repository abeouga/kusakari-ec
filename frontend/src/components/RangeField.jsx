import { useId, useState } from 'react';

/** @param {{label:string,name:string,min:number,max:number,defaultValue:number|null}} props */
export function OptionalRangeField({ defaultValue, ...props }) {
  const [value, setValue] = useState(String(defaultValue ?? ''));
  return <RangeField {...props} value={value} onChange={setValue} />;
}

/**
 * Message shown under the field while the typed value cannot be used. The value is still passed to onChange, so
 * the form-level check and the preview (issue #51) see the same state as the input.
 * @param {string} draft @param {{min:number,max:number,step:number,required:boolean,touched:boolean,unit?:string}} rule
 */
function fieldError(draft, { min, max, step, required, touched, unit = '' }) {
  if (draft === '') return required && touched ? '入力してください。' : '';
  const value = Number(draft);
  if (!Number.isFinite(value) || value < min || value > max) return `${min}〜${max}${unit}の範囲で入力してください。`;
  if (step === 1 && !Number.isInteger(value)) return '整数で入力してください。';
  return '';
}

/**
 * Slider + number + unit in the same columns for every field (issue #52). `aside` sits at the right of the label
 * row (the automatic / manual switch of the shape fields).
 * @param {{label:string,name:string,min:number,max:number,step?:number,value:string|number,onChange:(value:string)=>void,required?:boolean,hint?:string,unit?:string,aside?:import('react').ReactNode}} props
 */
export function RangeField({ label, name, min, max, step = 1, value, onChange, required = false, hint, unit, aside }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);
  const [touched, setTouched] = useState(false);
  if (!Object.is(value, previous)) {
    setPrevious(value);
    setDraft(String(value));
  }
  const empty = draft === '';
  const slider = empty ? min : Math.max(min, Math.min(max, Number(draft)));
  const error = fieldError(draft, { min, max, step, required, touched, unit });
  /** @param {string} next */
  function change(next) {
    setDraft(next);
    setTouched(true);
    setPrevious(typeof value === 'number' ? Number(next) : next);
    onChange(next);
  }
  return (
    <div className="range-field" data-invalid={error ? 'true' : undefined}>
      <div className="range-field-head">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="range-field-controls">
        <input
          type="range"
          aria-label={`${label}のスライダー`}
          min={min}
          max={max}
          step={step}
          value={slider}
          aria-valuetext={empty ? '未設定' : `${draft}${unit ?? ''}`}
          onChange={(e) => change(e.target.value)}
          onPointerUp={(e) => {
            if (empty) change(e.currentTarget.value);
          }}
          onKeyUp={(e) => {
            if (empty && ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
              change(e.currentTarget.value);
          }}
        />
        <span className="range-field-number">
          <input
            id={id}
            name={name}
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => change(e.target.value)}
          />
          {unit && <span className="range-field-unit">{unit}</span>}
        </span>
      </div>
      {error ? (
        <small id={`${id}-error`} className="range-field-error">
          {error}
        </small>
      ) : (
        <small className="muted range-field-note">
          {empty ? '未設定 · ' : ''}
          {hint ? `${min}〜${max}${unit ?? ''} · ${hint}` : `${min}〜${max}${unit ?? ''}`}
        </small>
      )}
    </div>
  );
}

/** @param {{label:string,name:string,options:[string,string][],value:string,onChange:(value:string)=>void}} props */
export function ChoiceRange({ label, name, options, value, onChange }) {
  const id = useId();
  const index = Math.max(
    0,
    options.findIndex(([key]) => key === value),
  );
  return (
    <div className="range-field choice-range">
      <div className="range-field-head">
        <label htmlFor={id}>{label}</label>
      </div>
      <input name={name} type="hidden" value={value} />
      <div className="range-field-controls">
        <input
          id={id}
          type="range"
          min="0"
          max={options.length - 1}
          step="1"
          value={index}
          aria-valuetext={options[index][1]}
          onChange={(e) => onChange(options[Number(e.target.value)][0])}
        />
        <output htmlFor={id}>{options[index][1]}</output>
      </div>
      <small className="muted range-field-note">
        {options[0][1]}〜{options[options.length - 1][1]}
      </small>
    </div>
  );
}
