import { useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { yen } from '../api';
import { Dialog } from './Dialog';
import './seller-products.css';

/** @type {Record<string,string>} */
const statusLabels = { PUBLISHED: '公開中', HIDDEN: '非表示', DELETED: '削除' };
/**
 * @param {{products:import('../types').Product[],storeName:string,busy:boolean,
 * onEdit:(product:import('../types').Product)=>void,
 * onStock:(product:import('../types').Product)=>void,
 * onStatus:(ids:string[],status:string)=>Promise<boolean>}} props
 */
export function SellerProductList({ products, storeName, busy, onEdit, onStock, onStatus }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(/** @type {string[]} */ ([]));
  const [pending, setPending] = useState(/** @type {{ids:string[],status:string}|null} */ (null));
  const needle = query.trim().toLocaleLowerCase('ja-JP');
  const filtered = products
    .filter(
      (p) =>
        (!needle || `${p.name} ${p.sku}`.toLocaleLowerCase('ja-JP').includes(needle)) &&
        (!category || p.category === category) &&
        (!status || p.publicationStatus === status),
    )
    .sort((a, b) => {
      const order =
        sort === 'priceAsc'
          ? a.priceYen - b.priceYen
          : sort === 'priceDesc'
            ? b.priceYen - a.priceYen
            : sort === 'name'
              ? a.name.localeCompare(b.name, 'ja')
              : Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      return order || a.id.localeCompare(b.id);
    });
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * 25, current * 25);
  const allSelected = rows.length > 0 && rows.every((p) => selected.includes(p.id));
  function resetSelection() {
    setSelected([]);
    setPage(1);
  }
  /** @param {string[]} ids @param {string} next */
  function confirm(ids, next) {
    setPending({ ids, status: next });
  }
  async function apply() {
    if (pending && (await onStatus(pending.ids, pending.status))) {
      setPending(null);
      setSelected([]);
    }
  }
  return (
    <>
      <div className="seller-filters">
        <label>
          商品検索
          <input
            type="search"
            placeholder="商品名・商品番号"
            value={query}
            disabled={busy}
            onChange={(e) => {
              setQuery(e.target.value);
              resetSelection();
            }}
          />
        </label>
        <label>
          カテゴリ
          <select
            value={category}
            disabled={busy}
            onChange={(e) => {
              setCategory(e.target.value);
              resetSelection();
            }}
          >
            <option value="">すべてのカテゴリ</option>
            {[...new Set(products.map((p) => p.category))]
              .sort((a, b) => a.localeCompare(b, 'ja'))
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
        </label>
        <label>
          公開状態
          <select
            value={status}
            disabled={busy}
            onChange={(e) => {
              setStatus(e.target.value);
              resetSelection();
            }}
          >
            <option value="">すべての状態</option>
            <option value="PUBLISHED">公開中</option>
            <option value="HIDDEN">非表示</option>
          </select>
        </label>
        <label>
          並び順
          <select
            value={sort}
            disabled={busy}
            onChange={(e) => {
              setSort(e.target.value);
              resetSelection();
            }}
          >
            <option value="newest">登録が新しい順</option>
            <option value="priceAsc">価格の安い順</option>
            <option value="priceDesc">価格の高い順</option>
            <option value="name">商品名順</option>
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() => {
            setQuery('');
            setCategory('');
            setStatus('');
            setSort('newest');
            resetSelection();
          }}
        >
          条件をリセット
        </button>
      </div>
      <p>
        {filtered.length}件の商品 / {current} / {pages}ページ
      </p>
      <div className="seller-bulk" aria-label="一括操作">
        <span>{selected.length}件選択中</span>
        <button disabled={busy || !selected.length} onClick={() => confirm(selected, 'HIDDEN')}>
          <EyeOff size={16} aria-hidden="true" />
          選択商品を非表示
        </button>
        <button disabled={busy || !selected.length} onClick={() => confirm(selected, 'PUBLISHED')}>
          <Eye size={16} aria-hidden="true" />
          選択商品を再公開
        </button>
        <button disabled={busy || !selected.length} onClick={() => confirm(selected, 'DELETED')}>
          <Trash2 size={16} aria-hidden="true" />
          選択商品を削除
        </button>
      </div>
      <table className="seller-product-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="現在ページの商品をすべて選択"
                checked={allSelected}
                disabled={busy || !rows.length}
                onChange={(e) => setSelected(e.target.checked ? rows.map((p) => p.id) : [])}
              />
            </th>
            <th>商品</th>
            <th>カテゴリ</th>
            <th>税込価格</th>
            <th>在庫</th>
            <th>公開状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-testid={`manage-${p.id}`}>
              <td data-label="選択">
                <input
                  type="checkbox"
                  aria-label={`${p.name}を選択`}
                  checked={selected.includes(p.id)}
                  disabled={busy}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))
                  }
                />
              </td>
              <td>
                <div className="seller-product-identity">
                  <img src={p.imageUrl} alt="" loading="lazy" />
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </div>
                </div>
              </td>
              <td data-label="カテゴリ">{p.category}</td>
              <td data-label="税込価格">{yen(p.priceYen)}</td>
              <td data-label="在庫">
                <div className="seller-stock">
                  <span>{p.stock}</span>
                  {p.stock === 0 && <small className="seller-stock-out">在庫切れ</small>}
                  <button
                    disabled={busy}
                    onClick={() => {
                      setSelected([]);
                      onStock(p);
                    }}
                  >
                    在庫を編集
                  </button>
                </div>
              </td>
              <td data-label="公開状態">
                <button
                  className={`seller-status ${p.publicationStatus === 'HIDDEN' ? 'is-hidden' : ''}`}
                  disabled={busy}
                  title={p.publicationStatus === 'HIDDEN' ? '押すと再公開します' : '押すと非表示にします'}
                  aria-label={p.publicationStatus === 'HIDDEN' ? '非表示：再公開する' : '公開中：非表示にする'}
                  onClick={async () => {
                    if (await onStatus([p.id], p.publicationStatus === 'HIDDEN' ? 'PUBLISHED' : 'HIDDEN')) {
                      setSelected([]);
                    }
                  }}
                >
                  {p.publicationStatus === 'HIDDEN' ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                  {statusLabels[p.publicationStatus] || p.publicationStatus}
                </button>
              </td>
              <td>
                <div className="seller-row-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setSelected([]);
                      onEdit(p);
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    編集
                  </button>
                  <button className="danger-text" disabled={busy} onClick={() => confirm([p.id], 'DELETED')}>
                    <Trash2 size={16} aria-hidden="true" />
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!busy && !rows.length && <p aria-live="polite">条件に一致する商品はありません。</p>}
      <nav className="seller-pagination" aria-label="商品一覧のページ">
        <button
          disabled={busy || current === 1}
          onClick={() => {
            setPage(current - 1);
            setSelected([]);
          }}
        >
          前のページ
        </button>
        <span>
          {current} / {pages}
        </span>
        <button
          disabled={busy || current === pages}
          onClick={() => {
            setPage(current + 1);
            setSelected([]);
          }}
        >
          次のページ
        </button>
      </nav>
      {pending && (
        <Dialog
          role="alertdialog"
          title="商品状態変更の確認"
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <div className="seller-confirm">
            <h3>{pending.status === 'DELETED' ? '削除' : pending.status === 'HIDDEN' ? '非表示' : '再公開'}の確認</h3>
            <p>
              対象店舗：{storeName} / {pending.ids.length}件
            </p>
            <ul>
              {pending.ids.map((id) => (
                <li key={id}>{products.find((p) => p.id === id)?.name ?? id}</li>
              ))}
            </ul>
            <p>
              {pending.status === 'PUBLISHED'
                ? 'この店舗の購入者一覧へ再公開します。'
                : 'この店舗の購入者一覧から除外し、カートに入っている場合も購入できなくなります。'}
            </p>
            {pending.status === 'DELETED' && (
              <p>この店舗の管理一覧からも削除します。復元はできません。注文履歴と他店舗の販売には影響しません。</p>
            )}
            <button className="primary-button" disabled={busy} onClick={apply}>
              {pending.status === 'DELETED'
                ? '削除を確定'
                : pending.status === 'HIDDEN'
                  ? '非表示を確定'
                  : '再公開を確定'}
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
