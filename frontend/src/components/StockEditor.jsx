import { useState } from 'react';

/**
 * Edits only the selected store's stock. `expected` is the stock shown when editing began; the server
 * rejects the save if it has changed since (EC-S05 5b), and the entered value is kept for re-confirmation.
 * @param {{product:import('../types').Product,busy:boolean,
 * onSave:(id:string,expected:number,stock:number)=>Promise<import('./useSellerCatalog').SaveResult>,
 * onDone:()=>void}} props
 */
export function StockEditor({ product, busy, onSave, onDone }) {
  const [expected, setExpected] = useState(product.stock);
  const [stock, setStock] = useState(String(product.stock));
  const [error, setError] = useState('');
  async function save() {
    const quantity = Number(stock);
    if (stock.trim() === '' || !Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
      setError('在庫は0〜10000の整数で入力してください。');
      return;
    }
    setError('');
    const result = await onSave(product.id, expected, quantity);
    if (result.saved) onDone();
    else if (result.latest) setExpected(result.latest.stock);
  }
  return (
    <div className="workspace-form" role="group" aria-label="在庫数の変更">
      <p>
        {product.name}：変更前の在庫数 {expected}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        在庫数
        <input
          type="number"
          min="0"
          max="10000"
          step="1"
          value={stock}
          onChange={(event) => setStock(event.target.value)}
        />
      </label>
      <button disabled={busy} onClick={save}>
        在庫を保存
      </button>
      <button disabled={busy} onClick={onDone}>
        取消
      </button>
    </div>
  );
}
