import { useId, useState } from 'react';

/** @param {{label:string,name:string,min:number,max:number,defaultValue:number|null}} props */
export function OptionalRangeField({ defaultValue, ...props }) {
  const [value, setValue] = useState(String(defaultValue ?? ''));
  return <RangeField {...props} value={value} onChange={setValue} />;
}

/**
 * Why the typed text cannot be used, or '' when it can. The step check follows the browser's stepMismatch (step base
 * = min), so the message matches the :invalid state that holds the preview (issue #51).
 * @param {string} draft @param {{min:number,max:number,step:number,unit?:string}} rule
 */
function problem(draft, { min, max, step, unit = '' }) {
  if (draft === '') return '入力してください。';
  const value = Number(draft);
  if (!Number.isFinite(value) || value < min || value > max) return `${min}〜${max}${unit}の範囲で入力してください。`;
  const steps = (value - min) / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6)
    return step === 1 ? '整数で入力してください。' : `${step}${unit}単位で入力してください。`;
  return '';
}

/** @param {string} draft @param {string|number} value the input already shows this value */
function shows(draft, value) {
  return typeof value === 'number' ? draft !== '' && Number(draft) === value : draft === String(value);
}

/**
 * Slider + number + unit in the same columns for every field (issue #52). `aside` sits at the right of the label
 * row (the automatic / manual switch of the shape fields).
 * With `validOnly`, onChange receives only usable values: the typed text that is empty, out of range or off the step
 * stays in the input with its message, and the owner keeps the last usable value. The plant model fields use it so
 * that a hidden group (flowers off) never carries an unusable value into the preview or the saved profile.
 * @param {{label:string,name:string,min:number,max:number,step?:number,value:string|number,onChange:(value:string)=>void,required?:boolean,validOnly?:boolean,hint?:string,unit?:string,aside?:import('react').ReactNode}} props
 */
export function RangeField({
  label,
  name,
  min,
  max,
  step = 1,
  value,
  onChange,
  required = false,
  validOnly = false,
  hint,
  unit,
  aside,
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);
  const [touched, setTouched] = useState(false);
  // A new value from outside (AI, undo, species preset) replaces the text; the value that follows typing does not.
  if (!Object.is(value, previous)) {
    setPrevious(value);
    if (!shows(draft, value)) setDraft(String(value));
  }
  const empty = draft === '';
  const slider = empty ? min : Math.max(min, Math.min(max, Number(draft)));
  const reason = problem(draft, { min, max, step, unit });
  const error = empty && !(required && touched) ? '' : reason;
  /** @param {string} next */
  function change(next) {
    setDraft(next);
    setTouched(true);
    if (!validOnly || !problem(next, { min, max, step, unit })) onChange(next);
  }
  const described = [unit && `${id}-unit`, error ? `${id}-error` : `${id}-note`].filter(Boolean).join(' ');
  return (
    <div className="range-field" data-invalid={error ? 'true' : undefined}>
      <div className="range-field-head">
        <label htmlFor={id} className={required ? 'required-label' : undefined}>
          {label}
        </label>
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
            aria-describedby={described}
            onChange={(e) => change(e.target.value)}
          />
          {unit && (
            <span id={`${id}-unit`} className="range-field-unit">
              {unit}
            </span>
          )}
        </span>
      </div>
      {error ? (
        <small id={`${id}-error`} className="range-field-error">
          {error}
        </small>
      ) : (
        <small id={`${id}-note`} className="muted range-field-note">
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
