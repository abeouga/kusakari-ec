import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { yen } from '../api';
import { Dialog } from './Dialog';
import { useShoppingData } from './useShoppingData';
import { chosenProduct, lineReason, quantityInCart } from '../shoppingSelection';

const TITLE = '庭に設置したものから追加';

/** Dashed card under the cart lines (issue #64). Guests have no saved gardens, so it is shown to members only.
 * @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function AddFromGardenCard({ shop }) {
  const [open, setOpen] = useState(false);
  if (shop.isGuest) return null;
  return (
    <>
      <button type="button" className="add-from-garden-card" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="add-from-garden-icon">
          <Plus size={22} aria-hidden="true" />
        </span>
        <span>
          <strong>{TITLE}</strong>
          <small>庭に配置した商品をえらんでカートに入れます</small>
        </span>
      </button>
      {open && <GardenItemsDialog shop={shop} onClose={() => setOpen(false)} />}
    </>
  );
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void}} props */
function GardenItemsDialog({ shop, onClose }) {
  const data = useShoppingData('');
  const [chosen, setChosen] = useState('');
  const gardenId = data.lists.some((list) => list.gardenId === chosen) ? chosen : (data.lists[0]?.gardenId ?? '');
  return (
    <Dialog title={TITLE} onClose={onClose} className="shopping-picker-dialog garden-items-dialog">
      <p className="shopping-picker-description">庭をえらび、カートに入れる商品にチェックしてください。</p>
      {data.loading && <p role="status">庭を読み込み中…</p>}
      {data.error && (
        <p role="alert" className="error">
          {data.error}
          <button type="button" className="text-button" onClick={data.reload}>
            再取得
          </button>
        </p>
      )}
      {!data.loading && !data.error && data.lists.length === 0 && (
        <p className="shopping-picker-empty">庭はまだありません。Canvasで庭をつくると、ここから追加できます。</p>
      )}
      {data.lists.length > 0 && (
        <div className="garden-items-gardens" role="group" aria-label="庭">
          {data.lists.map((list) => (
            <button
              type="button"
              key={list.gardenId}
              aria-pressed={list.gardenId === gardenId}
              onClick={() => setChosen(list.gardenId)}
            >
              <img
                src={`/api/shopping-lists/${encodeURIComponent(list.gardenId)}/thumbnail?v=${encodeURIComponent(list.thumbnailVersion)}`}
                alt=""
              />
              <span>
                {list.name}
                <small>{list.productCount}種類</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {gardenId && <GardenItems key={gardenId} shop={shop} gardenId={gardenId} onAdded={onClose} onCancel={onClose} />}
    </Dialog>
  );
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,gardenId:string,onAdded:()=>void,onCancel:()=>void}} props */
function GardenItems({ shop, gardenId, onAdded, onCancel }) {
  const data = useShoppingData(gardenId);
  const [selection, setSelection] = useState(/** @type {Record<string,string>} */ ({}));
  const [choices, setChoices] = useState(/** @type {Record<string,string>} */ ({}));
  const [failed, setFailed] = useState(false);
  const previousRevision = useRef(/** @type {string|null} */ (null));
  const detail = data.detail;
  const cart = shop.cart;
  const initialize = shop.initialize;
  useEffect(() => {
    if (!detail) return;
    const revision = `${detail.revision}:${detail.listRevision}`;
    if (previousRevision.current !== null && previousRevision.current !== revision) setSelection({});
    previousRevision.current = revision;
  }, [detail]);
  useEffect(() => {
    if (detail && cart && detail.storeId !== cart.storeId) void initialize();
  }, [detail, cart, initialize]);

  const lines = (detail?.items ?? []).map((line) => {
    const product = chosenProduct(line, choices[line.key]);
    const inCart = product ? quantityInCart(cart, product.id) : 0;
    return { line, product, inCart, reason: inCart ? '' : lineReason(line, product, 0) };
  });
  const selectable = lines.filter((item) => item.product && !item.inCart && !item.reason);
  const picked = lines.filter((item) => selection[item.line.key]);
  const quantity = picked.reduce((sum, item) => sum + item.line.quantity, 0);
  const blocked = shop.busy || !!data.error || !cart || !detail || detail.storeId !== cart.storeId;

  function selectAll() {
    setSelection(Object.fromEntries(selectable.map((item) => [item.line.key, item.product?.id ?? ''])));
  }
  async function add() {
    if (!detail || !cart || blocked || !picked.length) return;
    const items = Object.entries(selection).map(([key, productId]) => ({ key, productId }));
    setFailed(false);
    const result = await shop.transferShoppingList(gardenId, {
      gardenRevision: detail.revision,
      listRevision: detail.listRevision,
      cartRevision: cart.revision,
      items,
    });
    // EC-B25 4a: keep the selection so the buyer can retry; a changed list clears it (effect above).
    if (!result) {
      setFailed(true);
      await data.reload();
      return;
    }
    onAdded();
  }

  return (
    <>
      {data.loading && <p role="status">商品を読み込み中…</p>}
      {data.error && (
        <p role="alert" className="error">
          {data.error}
        </p>
      )}
      {failed && (
        <p role="alert" className="error">
          {shop.error || '選択した商品はカートに追加されていません。'}
        </p>
      )}
      {detail && lines.length === 0 && <p className="shopping-picker-empty">この庭に配置した商品はありません。</p>}
      {lines.length > 0 && (
        <>
          <div className="garden-items-toolbar">
            <button type="button" className="text-button" disabled={blocked || !selectable.length} onClick={selectAll}>
              すべて選択
            </button>
          </div>
          <div className="garden-items-list">
            {lines.map(({ line, product, inCart, reason }) => (
              <label
                key={line.key}
                className={inCart || reason ? 'garden-item is-unavailable' : 'garden-item'}
                data-testid={`garden-item-${line.key}`}
              >
                <input
                  type="checkbox"
                  aria-label={`${product?.name ?? line.name}を選択`}
                  checked={!!selection[line.key]}
                  disabled={blocked || !!inCart || (!!reason && !selection[line.key])}
                  onChange={(event) => {
                    const next = { ...selection };
                    if (event.target.checked && product) next[line.key] = product.id;
                    else delete next[line.key];
                    setSelection(next);
                  }}
                />
                {product ? <img src={product.imageUrl} alt="" /> : <span className="garden-item-noimage" />}
                <span className="garden-item-info">
                  <strong>{product?.name ?? line.name}</strong>
                  <small>
                    必要数 {line.quantity}点{product && `・店舗在庫 ${product.stock}点`}
                  </small>
                  {line.products.length > 1 && (
                    <select
                      aria-label={`${line.name}の購入商品`}
                      value={choices[line.key] ?? ''}
                      disabled={shop.busy}
                      onChange={(event) => {
                        setChoices({ ...choices, [line.key]: event.target.value });
                        const next = { ...selection };
                        delete next[line.key];
                        setSelection(next);
                      }}
                    >
                      <option value="">購入商品を選択</option>
                      {line.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} / {yen(p.priceYen)}
                        </option>
                      ))}
                    </select>
                  )}
                  {inCart > 0 && <span className="garden-item-tag">カートに入っています</span>}
                  {reason && <span className="garden-item-reason">{reason}</span>}
                </span>
                {product && <span className="garden-item-price">{yen(product.priceYen * line.quantity)}</span>}
              </label>
            ))}
          </div>
        </>
      )}
      <div className="garden-items-footer">
        <button type="button" className="outline-button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="primary-button" disabled={blocked || !picked.length} onClick={add}>
          <Plus size={18} aria-hidden="true" />
          {picked.length ? `${quantity}点をカートに追加` : 'カートに追加'}
        </button>
      </div>
    </>
  );
}
