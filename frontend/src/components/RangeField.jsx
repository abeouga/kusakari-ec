import { useId, useState } from 'react';

/** @param {{label:string,name:string,min:number,max:number,defaultValue:number|null}} props */
export function OptionalRangeField({ defaultValue, ...props }) {
  const [value, setValue] = useState(String(defaultValue ?? ''));
  return <RangeField {...props} value={value} onChange={setValue} />;
}

/** @param {{label:string,name:string,min:number,max:number,step?:number,value:string|number,onChange:(value:string)=>void,required?:boolean,hint?:string}} props */
export function RangeField({ label, name, min, max, step = 1, value, onChange, required = false, hint }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);
  if (!Object.is(value, previous)) {
    setPrevious(value);
    setDraft(String(value));
  }
  const empty = draft === '';
  const slider = empty ? min : Math.max(min, Math.min(max, Number(draft)));
  /** @param {string} next */
  function change(next) {
    setDraft(next);
    setPrevious(typeof value === 'number' ? Number(next) : next);
    onChange(next);
  }
  return (
    <div className="range-field">
      <label htmlFor={id}>{label}</label>
      <div className="range-field-controls">
        <input
          type="range"
          aria-label={`${label}のスライダー`}
          min={min}
          max={max}
          step={step}
          value={slider}
          aria-valuetext={empty ? '未設定' : draft}
          onChange={(e) => change(e.target.value)}
          onPointerUp={(e) => {
            if (empty) change(e.currentTarget.value);
          }}
          onKeyUp={(e) => {
            if (empty && ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
              change(e.currentTarget.value);
          }}
        />
        <input
          id={id}
          name={name}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          required={required}
          onChange={(e) => change(e.target.value)}
        />
      </div>
      <small className="muted">
        {empty ? '未設定 · ' : ''}
        {hint || `${min}〜${max}`}
      </small>
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
    <div className="range-field">
      <label htmlFor={id}>{label}</label>
      <input name={name} type="hidden" value={value} />
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
      <div className="range-labels" aria-hidden="true">
        {options.map(([key, text]) => (
          <span key={key}>{text}</span>
        ))}
      </div>
    </div>
  );
}
