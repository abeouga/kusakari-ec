import { useState } from 'react';
import { yen } from '../api';
import { catalogText } from '../catalogText';
import { Dialog } from '../components/Dialog';
import { useResource, write } from './useResource';
import { ResourceStatus } from './ResourceView';
import './operator-products.css';

/** @param {import('../businessTypes').ModeratedProduct} p */
const statusLabel = (p) => (p.suspended ? '公開停止中' : p.active ? '公開可能' : '販売終了');

/** Issue #6: the operator's product list shows what each product is and opens its details. */
export function OperatorProductsPage() {
  const resource = useResource('/operator/products');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(/** @type {import('../businessTypes').ModeratedProduct|null} */ (null));
  const rows = /** @type {import('../businessTypes').ModeratedProduct[]} */ (resource.data ?? []);
  const needle = query.trim().toLocaleLowerCase('ja-JP');
  const shown = rows.filter(
    (p) =>
      (!status || statusLabel(p) === status) &&
      (!needle ||
        `${p.name} ${p.sku} ${p.category} ${p.description} ${p.nurseryName}`
          .toLocaleLowerCase('ja-JP')
          .includes(needle)),
  );
  return (
    <>
      <ResourceStatus resource={resource} />
      <div className="operator-product-filters" role="search">
        <label>
          キーワード
          <input
            type="search"
            value={query}
            placeholder="商品名・商品番号・カテゴリー・説明"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          状態
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">すべて</option>
            <option>公開可能</option>
            <option>公開停止中</option>
            <option>販売終了</option>
          </select>
        </label>
      </div>
      {resource.data && (
        <p role="status">
          {shown.length}件 / 全{rows.length}件
        </p>
      )}
      {shown.map((row) => (
        <ProductModerationRow key={row.id} row={row} resource={resource} onOpen={() => setDetail(row)} />
      ))}
      {resource.data && shown.length === 0 && <p>対象の商品はありません。</p>}
      {detail && <OperatorProductDetail product={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/** @param {{row:import('../businessTypes').ModeratedProduct,resource:ReturnType<typeof useResource>,onOpen:()=>void}} props */
function ProductModerationRow({ row, resource, onOpen }) {
  const [reason, setReason] = useState('');
  return (
    <section className="workspace-card operator-product" data-testid={`operator-product-${row.id}`}>
      {row.imageUrl ? (
        <img className="operator-product-thumb" src={row.imageUrl} alt="" />
      ) : (
        <span className="operator-product-thumb" />
      )}
      <div className="operator-product-body">
        <h3>
          <button type="button" className="text-button" onClick={onOpen}>
            {row.name}
          </button>
        </h3>
        <p className="operator-product-meta">
          {row.category} / 商品番号 {row.sku} / {yen(row.priceYen)} / {statusLabel(row)}
        </p>
        <p className="operator-product-description">{catalogText(row.description)}</p>
        <label>
          理由・コメント
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        <button
          disabled={resource.busy || !reason.trim()}
          onClick={() =>
            void resource.run(() =>
              write(`/operator/products/${row.id}/moderation`, 'PUT', { suspended: !row.suspended, reason }),
            )
          }
        >
          {row.suspended ? '公開停止を解除' : '公開を停止'}
        </button>
      </div>
    </section>
  );
}

/** @param {{product:import('../businessTypes').ModeratedProduct,onClose:()=>void}} props */
function OperatorProductDetail({ product, onClose }) {
  return (
    <Dialog title="商品の詳細" onClose={onClose} wide>
      <div className="operator-product-detail">
        {product.imageUrl && <img src={product.imageUrl} alt={product.name} />}
        <div>
          <h3>{product.name}</h3>
          <dl>
            <dt>カテゴリー</dt>
            <dd>{product.category}</dd>
            <dt>商品番号</dt>
            <dd>{product.sku}</dd>
            <dt>税込価格</dt>
            <dd>{yen(product.priceYen)}</dd>
            <dt>生産者</dt>
            <dd>{catalogText(product.nurseryName) || '未設定'}</dd>
            <dt>状態</dt>
            <dd>{statusLabel(product)}</dd>
          </dl>
          <p className="operator-product-detail-description">{catalogText(product.description)}</p>
        </div>
      </div>
    </Dialog>
  );
}
