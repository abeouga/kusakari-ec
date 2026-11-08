import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { yen } from '../api';
import { navigate } from '../workspace/navigation';
import { PageLink } from '../workspace/Common';
import { useShoppingData } from './useShoppingData';
import { chosenProduct as productFor, lineReason, quantityInCart } from '../shoppingSelection';

/** @param {string} version */
function thumbnailLabel(version) {
  if (version?.startsWith('generated-')) return '生成イメージ';
  if (version?.startsWith('scene-')) return 'Canvasの配置';
  return '庭の配置図';
}

export function ShoppingListOverview() {
  const data = useShoppingData('');
  return <section className="garden-shopping-section" id="garden-shopping-lists" aria-label="庭の買い物リスト">
    <h2>庭の買い物リスト</h2>
    {data.loading && <p role="status">庭の買い物リストを読み込み中…</p>}
    {data.error && <p role="alert">{data.error}<button type="button" onClick={data.reload}>再取得</button></p>}
    {!data.loading && !data.error && data.lists.length === 0 && <p>庭はまだありません。</p>}
    <div className="garden-shopping-grid">{data.lists.map(list => <article key={list.gardenId} data-testid={'garden-list-' + list.gardenId}>
      {/* Issue #62: the whole card is the link, so the thumbnail and description open the list too. */}
      <PageLink className="garden-list-card" href={'/cart/gardens/' + encodeURIComponent(list.gardenId)} label={list.name + 'の買い物リストを開く'}>
        <img className="garden-list-thumbnail" loading="lazy" src={'/api/shopping-lists/' + encodeURIComponent(list.gardenId) + '/thumbnail?v=' + encodeURIComponent(list.thumbnailVersion)} alt={list.name + 'の庭のイメージ'}/>
        <div className="garden-list-description"><h3>{list.name}</h3><p>{list.productCount}種類・必要数 {list.itemCount}点</p>
        <p className="fine-print">更新 {new Date(list.updatedAt).toLocaleString('ja-JP')}</p>
        {list.itemCount === 0 && <p>買い物リストは空です。</p>}
        <small className="fine-print">{thumbnailLabel(list.thumbnailVersion)}</small></div>
        <ChevronRight className="garden-list-chevron" size={20} aria-hidden="true"/>
      </PageLink>
    </article>)}</div>
  </section>;
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,gardenId:string}} props */
export function ShoppingListDetail({ shop, gardenId }) {
  const data = useShoppingData(gardenId);
  const [selection, setSelection] = useState(/** @type {Record<string,string>} */ ({}));
  const [choices, setChoices] = useState(/** @type {Record<string,string>} */ ({}));
  const [changed, setChanged] = useState('');
  const [selectNote, setSelectNote] = useState(/** @type {string[]} */ ([]));
  const [transferFailed, setTransferFailed] = useState(false);
  const previousRevision = useRef(/** @type {string|null} */ (null));
  const detail = data.detail;
  const cart = shop.cart;
  const initialize = shop.initialize;
  useEffect(() => {
    if (!detail) return;
    const revision = `${detail.revision}:${detail.listRevision}`;
    if (previousRevision.current !== null && previousRevision.current !== revision) {
      setSelection({});
      setChoices({});
      setSelectNote([]);
      setTransferFailed(false);
      setChanged('庭の買い物リストが更新されました。必要な商品を選び直してください。');
    }
    previousRevision.current = revision;
  }, [detail]);
  useEffect(() => {
    if (detail && cart && detail.storeId !== cart.storeId) void initialize();
  }, [detail, cart, initialize]);
  /** @param {string} productId */
  function inCart(productId) {
    return quantityInCart(cart, productId);
  }
  /** @param {import('../types').ShoppingLine} line */
  function chosenProduct(line) {
    return productFor(line, choices[line.key]);
  }
  function selectAll() {
    const next = /** @type {Record<string,string>} */ ({});
    const left = [];
    for (const line of detail?.items ?? []) {
      const product = chosenProduct(line);
      const reason = lineReason(line, product, product ? inCart(product.id) : 0);
      if (product && !reason) next[line.key] = product.id;
      else left.push(`${product?.name ?? line.name}（${reason}）`);
    }
    setSelection(next);
    setSelectNote(left);
  }
  async function transfer() {
    if (!detail || !cart || shop.busy || data.error || detail.storeId !== cart.storeId) return;
    const items = Object.entries(selection).map(([key, productId]) => ({ key, productId }));
    if (!items.length) return;
    setTransferFailed(false);
    const result = await shop.transferShoppingList(gardenId, { gardenRevision: detail.revision, listRevision: detail.listRevision, cartRevision: cart.revision, items });
    // EC-B25 4a: keep the selection so the same request can be retried. A changed list clears it (effect above).
    if (!result) { setTransferFailed(true); await data.reload(); return; }
    setSelection({});
    setSelectNote([]);
    if (result.added.length) navigate('/cart');
  }
  const lines = detail?.items ?? [];
  const chosen = lines.flatMap(line => {
    const product = line.products.find(p => p.id === selection[line.key]);
    return product ? [{ line, product }] : [];
  });
  const count = chosen.reduce((sum, { line }) => sum + line.quantity, 0);
  const subtotal = chosen.reduce((sum, { line, product }) => sum + product.priceYen * line.quantity, 0);
  const canAdd = chosen.length > 0 && !shop.busy && !data.error && !!cart && detail?.storeId === cart.storeId;
  return <section className="garden-shopping-section cart-content" aria-label="庭の買い物リスト詳細">
    <button type="button" className="text-button garden-list-back" onClick={() => navigate('/cart#garden-shopping-lists')}>
      <ArrowLeft size={16} aria-hidden />庭の買い物リスト一覧へ</button>
    <h2>{detail ? detail.name + 'の買い物リスト' : '庭の買い物リスト'}</h2>
    {data.loading && <p role="status">読み込み中…</p>}
    {data.error && <p role="alert">{data.error}<button type="button" onClick={data.reload}>再取得</button></p>}
    {shop.error && <p role="alert">{shop.error}</p>}
    {changed && <p role="status">{changed}</p>}
    {transferFailed && Object.keys(selection).length > 0 && <p role="alert" className="error">選択した商品はカートに追加されていません。選択はそのまま残っています。
      <button type="button" disabled={shop.busy} onClick={transfer}>再実行</button></p>}
    {selectNote.length > 0 && <div role="status" className="garden-select-note"><p>次の商品は追加できないため選択していません。</p>
      <ul>{selectNote.map(note => <li key={note}>{note}</li>)}</ul></div>}
    <ShoppingTransferNotice shop={shop}/>
    {detail?.items.length === 0 && <p>この庭の買い物リストは空です。</p>}
    {detail && <div className="checkout-layout">
      <div>
        <div className="garden-shopping-actions"><button type="button" className="text-button" disabled={shop.busy || !!data.error} onClick={selectAll}>全選択</button>
          <button type="button" className="text-button" disabled={shop.busy} onClick={() => { setSelection({}); setSelectNote([]); }}>選択解除</button></div>
        <div className="cart-items">{lines.map(line => {
          const product = chosenProduct(line);
          const reason = lineReason(line, product, product ? inCart(product.id) : 0);
          const held = product ? inCart(product.id) : 0;
          return <article className="cart-line garden-shopping-line" key={line.key} data-testid={'ec-shopping-line-' + line.key}>
            <input type="checkbox" aria-label={line.name + 'を選択'} checked={!!selection[line.key]} disabled={shop.busy || !!data.error || (!!reason && !selection[line.key])}
              onChange={event => {
                const next = { ...selection };
                if (event.target.checked && product) next[line.key] = product.id;
                else delete next[line.key];
                setSelection(next);
              }}/>
            {product ? <img src={product.imageUrl} alt={product.name}/> : <span className="garden-shopping-noimage" aria-hidden/>}
            <div className="cart-line-main">
              <h3>{product?.name ?? line.name}</h3>
              {product && <p>{yen(product.priceYen)} / 1鉢</p>}
              <p>必要数 {line.quantity}点{product && `・店舗在庫 ${product.stock}点`}{held > 0 && `・カートに${held}点`}</p>
              {line.products.length > 1 && <label>購入商品<select aria-label={line.name + 'の購入商品'} value={choices[line.key] ?? ''} disabled={shop.busy}
                onChange={event => {
                  setChoices({ ...choices, [line.key]: event.target.value });
                  const next = { ...selection };
                  delete next[line.key];
                  setSelection(next);
                }}><option value="">選択してください</option>{line.products.map(p => <option key={p.id} value={p.id}>{p.name} / {yen(p.priceYen)}</option>)}</select></label>}
              {reason && <p className="error-text">{reason}</p>}
            </div>
            <div className="cart-line-end">{product && <strong>{yen(product.priceYen * line.quantity)}</strong>}</div>
          </article>;
        })}</div>
      </div>
      <aside className="checkout-summary" aria-label="選択した商品の小計">
        <p className="eyebrow">SELECTED ITEMS</p>
        <h3>選択した商品</h3>
        <div className="totals">
          <div><span>選択した商品</span><span>{count}点</span></div>
          <div><span>商品小計（税込）<small> / 内税10%</small></span><span>{yen(subtotal)}</span></div>
          <div><span>うち消費税（内税10%）</span><span>{yen(Math.floor((subtotal * 10) / 110))}</span></div>
          <div className="grand-total"><strong>合計</strong><strong>{yen(subtotal)}</strong></div>
        </div>
        <button type="button" className="primary-button full" disabled={!canAdd} onClick={transfer}>カートに追加<Plus size={18} aria-hidden/></button>
      </aside>
    </div>}
  </section>;
}

/** @param {{shop:ReturnType<import('../useShop').useShop>}} props */
export function ShoppingTransferNotice({ shop }) {
  const result = shop.shoppingTransfer;
  if (!result) return null;
  return <section className="garden-transfer-result" role="status">
    <p>{result.gardenName}から{result.added.length}種類を追加しました。</p>
    {result.skipped.length > 0 && <><p>{result.skipped.length}種類は追加できませんでした。</p>
      <ul>{result.skipped.map(item => <li key={item.productId}>{item.name}：{item.message}</li>)}</ul>
      <button type="button" onClick={() => navigate('/cart/gardens/' + result.gardenId)}>庭のリストを再確認</button></>}
    <button type="button" className="text-button" onClick={() => shop.setShoppingTransfer(null)}>結果を閉じる</button>
  </section>;
}
