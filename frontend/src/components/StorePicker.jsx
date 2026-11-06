import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { PickerDialog } from './PickerDialog';
import { StoreMap, hasLocation } from './StoreMap';

/**
 * Chooses the store whose stock the new product registers, from map pins or the store list (issue #46).
 * @param {{stores:import('./StoreMap').MapStore[],value:number,disabled:boolean,onChange:(id:number)=>void}} props
 */
export function StorePicker({ stores, value, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const nameId = useId();
  const addressId = useId();
  const current = stores.find((store) => store.id === value);
  const unlocated = stores.filter((store) => !hasLocation(store));
  /** @param {number} id */
  function choose(id) {
    if (id !== value) onChange(id);
    setOpen(false);
  }
  return (
    <div className="picker-field">
      <span className="picker-field-label required-label">
        在庫を登録する店舗
        <span className="required-mark-text">必須</span>
      </span>
      <div className="picker-field-value">
        <strong id={nameId}>{current?.name ?? '未選択'}</strong>
        <button
          type="button"
          className="secondary-button"
          aria-label="在庫を登録する店舗を選ぶ"
          aria-describedby={current?.address ? `${nameId} ${addressId}` : nameId}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          選ぶ
        </button>
      </div>
      {current?.address && (
        <small id={addressId} className="muted">
          {current.address}
        </small>
      )}
      {open && (
        <PickerDialog title="在庫を登録する店舗を選ぶ" wide onClose={() => setOpen(false)}>
          <div className="store-picker-layout">
            <StoreMap stores={stores} value={value} onChoose={choose} />
            <div className="store-picker-list">
              <h3>店舗一覧</h3>
              <ul className="picker-options" aria-label="店舗一覧">
                {stores.map((store) => (
                  <li key={store.id}>
                    <button
                      type="button"
                      aria-pressed={store.id === value}
                      data-autofocus={store.id === value ? true : undefined}
                      onClick={() => choose(store.id)}
                    >
                      <span>
                        <strong>{store.name}</strong>
                        {store.address && <small>{store.address}</small>}
                      </span>
                      {store.id === value && <Check className="seller-ui-icon" size={16} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
              {unlocated.length > 0 && (
                <p className="fine-print">位置情報のない店舗は地図に表示されません。一覧から選んでください。</p>
              )}
            </div>
          </div>
        </PickerDialog>
      )}
    </div>
  );
}
