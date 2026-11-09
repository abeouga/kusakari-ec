import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { yen } from '../api';
import { navigate } from '../workspace/navigation';
import { Dialog } from './Dialog';
import { useShoppingData } from './useShoppingData';
import { chosenProduct, lineReason, quantityInCart } from '../shoppingSelection';

const TITLE = '庭に設置したものから追加';

/** Issue #88: `/cart?garden={gardenId}` opens the dialog with that garden chosen (`?garden=` opens it with the first
 * garden). Canvas links here instead of the removed garden-only list screen. Returns null when the dialog is not asked for. */
function requestedGarden() {
  return new URLSearchParams(window.location.search).get('garden');
}

function useRequestedGarden() {
  const [garden, setGarden] = useState(requestedGarden);
  useEffect(() => {
    const changed = () => setGarden(requestedGarden());
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  function clear() {
    if (requestedGarden() === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('garden');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setGarden(null);
  }
  return { garden, clear };
}

/** Dashed card under the cart lines (issue #64). The cart page is member-only (issue #10).
 * PR #66 review: the card is as tall as the cart line right above it. A line's height depends on how its product
 * name wraps, so the card follows the measured height of `matchHeight` instead of a fixed value.
 * @param {{shop:ReturnType<import('../useShop').useShop>,matchHeight?:HTMLElement|null}} props */
export function AddFromGardenCard({ shop, matchHeight = null }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const requested = useRequestedGarden();
  useEffect(() => {
    if (!matchHeight) {
      setHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => setHeight(matchHeight.getBoundingClientRect().height));
    observer.observe(matchHeight);
    return () => observer.disconnect();
  }, [matchHeight]);
  function close() {
    setOpen(false);
    requested.clear();
  }
  return (
    <>
      <button
        type="button"
        className="add-from-garden-card"
        style={height ? { height } : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="add-from-garden-icon">
          <Plus size={22} aria-hidden="true" />
        </span>
        <strong>{TITLE}</strong>
      </button>
      {(open || requested.garden !== null) && (
        <GardenItemsDialog shop={shop} initialGarden={requested.garden ?? ''} onClose={close} />
      )}
    </>
  );
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,initialGarden:string,onClose:()=>void}} props */
function GardenItemsDialog({ shop, initialGarden, onClose }) {
  const data = useShoppingData('');
  const [chosen, setChosen] = useState(initialGarden);
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

/** Result of the last transfer, shown above the cart. Skipped products can be chosen again in the dialog.
 * @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ShoppingTransferNotice({ shop }) {
  const result = shop.shoppingTransfer;
  if (!result) return null;
  return (
    <section className="garden-transfer-result" role="status">
      <p>
        {result.gardenName}から{result.added.length}種類を追加しました。
      </p>
      {result.skipped.length > 0 && (
        <>
          <p>{result.skipped.length}種類は追加できませんでした。</p>
          <ul>
            {result.skipped.map((item) => (
              <li key={item.productId}>
                {item.name}：{item.message}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => navigate(`/cart?garden=${encodeURIComponent(result.gardenId)}`)}>
            庭から選び直す
          </button>
        </>
      )}
      <button type="button" className="text-button" onClick={() => shop.setShoppingTransfer(null)}>
        結果を閉じる
      </button>
    </section>
  );
}
