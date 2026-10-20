import { useEffect, useRef, useState } from 'react';
import { yen } from '../api';
import { navigate } from '../workspace/navigation';
import { useShoppingData } from './useShoppingData';

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
    <p>庭ごとに必要な商品を確認し、購入する商品をカートへ追加できます。</p>
    {data.loading && <p role="status">庭の買い物リストを読み込み中…</p>}
    {data.error && <p role="alert">{data.error}<button type="button" onClick={data.reload}>再取得</button></p>}
    {!data.loading && !data.error && data.lists.length === 0 && <p>庭はまだありません。</p>}
    <div className="garden-shopping-grid">{data.lists.map(list => <article key={list.gardenId} data-testid={'garden-list-' + list.gardenId}>
      <img className="garden-list-thumbnail" loading="lazy" src={'/api/shopping-lists/' + encodeURIComponent(list.gardenId) + '/thumbnail?v=' + encodeURIComponent(list.thumbnailVersion)} alt={list.name + 'の庭のイメージ'}/>
      <div className="garden-list-description"><h3>{list.name}</h3><p>{list.productCount}種類・必要数 {list.itemCount}点</p>
      <p className="fine-print">更新 {new Date(list.updatedAt).toLocaleString('ja-JP')}</p>
      {list.itemCount === 0 && <p>買い物リストは空です。</p>}
      <small className="fine-print">{thumbnailLabel(list.thumbnailVersion)}</small></div>
      <button type="button" className="secondary-button" onClick={() => navigate('/cart/gardens/' + list.gardenId)}>買い物リストを開く</button>
    </article>)}</div>
  </section>;
}

/** @param {{shop:ReturnType<import('../useShop').useShop>,gardenId:string}} props */
export function ShoppingListDetail({ shop, gardenId }) {
  const data = useShoppingData(gardenId);
  const [selection, setSelection] = useState(/** @type {Record<string,string>} */ ({}));
  const [choices, setChoices] = useState(/** @type {Record<string,string>} */ ({}));
  const [changed, setChanged] = useState('');
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
      setChanged('庭の買い物リストが更新されました。必要な商品を選び直してください。');
    }
    previousRevision.current = revision;
  }, [detail]);
  useEffect(() => {
    if (detail && cart && detail.storeId !== cart.storeId) void initialize();
  }, [detail, cart, initialize]);
  /** @param {import('../types').ShoppingProduct} product @param {number} quantity */
  function unavailable(product, quantity) {
    if (!product.active) return '販売終了';
    if (quantity > 99) return '必要数がカート上限99点を超えています';
    if (product.stock < quantity) return '在庫不足';
    return '';
  }
  /** @param {import('../types').ShoppingLine} line */
  function chosenProduct(line) {
    return line.products.find(p => p.id === choices[line.key]) ?? (line.products.length === 1 ? line.products[0] : null);
  }
  function selectAll() {
    const next = /** @type {Record<string,string>} */ ({});
    for (const line of detail?.items ?? []) {
      const product = chosenProduct(line);
      if (product && !unavailable(product, line.quantity)) next[line.key] = product.id;
    }
    setSelection(next);
  }
  async function transfer() {
    if (!detail || !cart || shop.busy || data.error || detail.storeId !== cart.storeId) return;
    const items = Object.entries(selection).map(([key, productId]) => ({ key, productId }));
    if (!items.length) return;
    const result = await shop.transferShoppingList(gardenId, { gardenRevision: detail.revision, listRevision: detail.listRevision, cartRevision: cart.revision, items });
    if (!result) { setSelection({}); await data.reload(); return; }
    setSelection({});
    if (result.added.length) navigate('/cart');
  }
  return <section className="garden-shopping-section" aria-label="庭の買い物リスト詳細">
    <button type="button" className="text-button" onClick={() => navigate('/cart#garden-shopping-lists')}>庭の買い物リスト一覧へ</button>
    <h2>{detail ? detail.name + 'の買い物リスト' : '庭の買い物リスト'}</h2>
    <p>庭に配置した商品と、商品一覧から追加した商品を表示します。購入する商品を選択してください。</p>
    {detail && <p>受取店舗：{detail.storeName} <button type="button" className="text-button" onClick={() => navigate('/cart')}>カートで店舗を変更</button></p>}
    {data.loading && <p role="status">読み込み中…</p>}
    {data.error && <p role="alert">{data.error}<button type="button" onClick={data.reload}>再取得</button></p>}
    {shop.error && <p role="alert">{shop.error}</p>}
    {changed && <p role="status">{changed}</p>}
    <ShoppingTransferNotice shop={shop}/>
    {detail?.items.length === 0 && <p>この庭の買い物リストは空です。</p>}
    {detail && <>
      <div className="garden-shopping-actions"><button type="button" disabled={shop.busy || !!data.error} onClick={selectAll}>全選択</button>
        <button type="button" disabled={shop.busy} onClick={() => setSelection({})}>選択解除</button></div>
      {detail.items.map(line => {
        const product = chosenProduct(line);
        const reason = product ? unavailable(product, line.quantity) : line.products.length ? '購入商品を選択してください' : '対応する販売商品がありません';
        return <article className="garden-shopping-line" key={line.key} data-testid={'ec-shopping-line-' + line.key}>
          <input type="checkbox" aria-label={line.name + 'を選択'} checked={!!selection[line.key]} disabled={shop.busy || !!data.error || (!!reason && !selection[line.key])}
            onChange={event => {
              const next = { ...selection };
              if (event.target.checked && product) next[line.key] = product.id;
              else delete next[line.key];
              setSelection(next);
            }}/>
          {product && <img src={product.imageUrl} alt=""/>}
          <div><h3>{product?.name ?? line.name}</h3><p>必要数 {line.quantity}点</p>
            {line.products.length > 1 && <label>購入商品<select aria-label={line.name + 'の購入商品'} value={choices[line.key] ?? ''} disabled={shop.busy}
              onChange={event => {
                setChoices({ ...choices, [line.key]: event.target.value });
                const next = { ...selection };
                delete next[line.key];
                setSelection(next);
              }}><option value="">選択してください</option>{line.products.map(p => <option key={p.id} value={p.id}>{p.name} / {yen(p.priceYen)}</option>)}</select></label>}
            {product && <><p>{yen(product.priceYen)} / 点・小計 {yen(product.priceYen * line.quantity)}</p>
              <p>店舗在庫 {product.stock}点・カートに {cart?.items.find(item => item.product.id === product.id)?.quantity ?? 0}点</p></>}
            {reason && <p className="error">{reason}</p>}
          </div>
        </article>;
      })}
      <p>同じ商品がカートにある場合は数量を加算します。在庫不足などの商品は追加せず、理由を表示します。</p>
      <button type="button" className="primary-button" disabled={!Object.keys(selection).length || shop.busy || !!data.error || !cart || detail.storeId !== cart.storeId} onClick={transfer}>選択した商品をカートに追加</button>
    </>}
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
