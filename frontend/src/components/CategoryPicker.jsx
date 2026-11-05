import { Check, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useResource } from '../workspace/useResource';
import { PickerDialog } from './PickerDialog';

/** @param {{value:string,onChange:(value:string)=>void}} props */
export function CategoryPicker({ value, onChange }) {
  const categories = useResource('/categories');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const currentId = useId();
  /** @type {string[]} */
  const names = categories.data ?? [];
  const needle = query.trim().toLocaleLowerCase('ja-JP');
  const matches = names.filter((name) => name.toLocaleLowerCase('ja-JP').includes(needle));
  /** @param {string} name */
  function choose(name) {
    onChange(name);
    setOpen(false);
  }
  return (
    <div className="picker-field">
      <span className="picker-field-label">カテゴリー</span>
      <input type="hidden" name="category" value={value} />
      <div className="picker-field-value">
        <strong id={currentId}>{value}</strong>
        {categories.data ? (
          <button
            type="button"
            className="secondary-button"
            aria-label="カテゴリーを選ぶ"
            aria-describedby={currentId}
            aria-haspopup="dialog"
            onClick={() => {
              setQuery('');
              setOpen(true);
            }}
          >
            選ぶ
          </button>
        ) : (
          <small className="muted">{categories.error || 'カテゴリーを読み込んでいます。'}</small>
        )}
      </div>
      {open && (
        <PickerDialog title="カテゴリーを選ぶ" onClose={() => setOpen(false)}>
          <label className="picker-filter">
            <span>
              <Search className="seller-ui-icon" size={16} aria-hidden="true" />
              カテゴリー名で絞り込み
            </span>
            <input
              type="text"
              data-autofocus
              value={query}
              placeholder="例：ハーブ"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matches.length === 1) choose(matches[0]);
              }}
            />
          </label>
          <p className="muted" role="status">
            {matches.length}件のカテゴリー
          </p>
          <ul className="picker-options" aria-label="カテゴリー一覧">
            {matches.map((name) => (
              <li key={name}>
                <button type="button" aria-pressed={name === value} onClick={() => choose(name)}>
                  {name}
                  {name === value && <Check className="seller-ui-icon" size={16} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p>該当するカテゴリーがありません。絞り込みの文字を変えてください。</p>}
        </PickerDialog>
      )}
    </div>
  );
}
