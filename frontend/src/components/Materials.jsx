import { useEffect, useState } from 'react';
import { ArrowRight, FileJson } from 'lucide-react';
import { Dialog } from './Dialog';
import { api, yen } from '../api';
import { PageLink } from '../workspace/Common';
import { readIncomingMaterials, validateMaterials } from '../workspace/materialTransfer';

const example = JSON.stringify(
  [
    { materialCode: 'plant.olive', quantity: 1, unit: 'piece' },
    { materialCode: 'plant.herb', quantity: 2, unit: 'piece' },
  ],
  null,
  2,
);

/** @param {{shop:ReturnType<import('../useShop').useShop>, onClose:()=>void,embedded?:boolean}} props */
export function Materials({ shop, onClose, embedded = false }) {
  const [incoming] = useState(readIncomingMaterials);
  const [source, setSource] = useState(() => {
    if (incoming.items) return JSON.stringify(incoming.items, null, 2);
    if (incoming.error) return '';
    return example;
  });
  const [matches, setMatches] = useState(/** @type {import('../types').MaterialMatch[]} */ ([]));
  const [error, setError] = useState(incoming.error);
  const storeId = shop.cart?.storeId;
  useEffect(() => {
    if (!incoming.items || !storeId) return;
    let active = true;
    setBusy(true);
    api
      .materials(storeId, incoming.items)
      .then((results) => {
        if (active) setMatches(results);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : '商品候補を取得できませんでした。');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [incoming, storeId]);
  const [busy, setBusy] = useState(false);
  let searchLabel = '商品候補を検索';
  if (busy) searchLabel = '検索中…';
  let errorMessage = shop.error;
  if (error) errorMessage = error;
  async function search() {
    if (!shop.cart) return;
    setError('');
    setBusy(true);
    setMatches([]);
    try {
      const items = validateMaterials(JSON.parse(source));
      if (!Array.isArray(items)) {
        throw new Error('材料リストはJSON配列で入力してください。');
      }
      const results = await api.materials(shop.cart.storeId, items);
      setMatches(results);
    } catch (reason) {
      let message = '材料リストを確認してください。';
      if (reason instanceof Error) message = reason.message;
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  const sourceEditor = (
    <>
      <label className="field-label" htmlFor="material-json">
        <FileJson size={17} />
        材料リスト（JSON）
      </label>
      <textarea
        id="material-json"
        spellCheck={false}
        disabled={busy || shop.busy}
        value={source}
        onChange={(event) => {
          setSource(event.target.value);
          setMatches([]);
        }}
        rows={10}
      />
      <p className="fine-print">
        対応コード：plant.olive / plant.lavender / plant.rosemary / plant.monstera / plant.herb。単位は
        piece（点）です。Canvasの木・低木・レンガ・ベンチにも対応しています。
      </p>
    </>
  );
  return (
    <MaterialsFrame embedded={embedded} onClose={onClose}>
      <p className="muted">
        材料コードと必要個数から、選択中の店舗で扱う商品候補を表示します。候補は個別に選んでカートへ追加できます。
      </p>
      {embedded && (
        <>
          <p>庭の配置数量に合う商品を選んで、カートに追加してください。</p>
          <div className="workspace-actions">
            <PageLink className="primary-button" href="/cart">
              カートを確認（{shop.cart?.itemCount || 0}点）
            </PageLink>
            <a className="outline-button" href={import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/'}>
              Canvasへ戻る
            </a>
          </div>
          <details className="material-data-details">
            <summary>材料データを確認・変更</summary>
            {sourceEditor}
          </details>
        </>
      )}
      {!embedded && sourceEditor}
      <button className="primary-button" disabled={busy || shop.busy || !shop.cart} onClick={search}>
        {searchLabel}
        <ArrowRight size={17} />
      </button>
      {errorMessage && (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      )}
      {shop.notice && (
        <p className="success-text" role="status">
          {shop.notice}
        </p>
      )}
      <div className="material-results">
        {matches.map((match, index) => (
          <section key={`${match.materialCode}-${index}`}>
            <h3>{embedded ? match.candidates[0]?.product.name || '対応する商品がありません' : match.materialCode}</h3>
            {!match.candidates.length && (
              <p className="muted">対応する商品はありません。配置素材または材料データを確認してください。</p>
            )}
            {match.candidates.map((candidate) => (
              <div className="material-candidate" key={candidate.product.id}>
                <img src={candidate.product.imageUrl} alt="" />
                <div>
                  <strong>{candidate.product.name}</strong>
                  <p>
                    {candidate.purchaseQuantity} 点 / {yen(candidate.lineTotalYen)}
                  </p>
                  <small>店舗在庫 {candidate.product.stock} 点</small>
                </div>
                <button
                  className="secondary-button"
                  disabled={shop.busy || !candidate.available}
                  onClick={() => shop.add(candidate.product.id, candidate.purchaseQuantity)}
                >
                  {candidate.available && 'カートに追加'}
                  {!candidate.available && '在庫不足'}
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </MaterialsFrame>
  );
}

/** @param {{embedded:boolean,onClose:()=>void,children:import('react').ReactNode}} props */
function MaterialsFrame({ embedded, onClose, children }) {
  if (embedded)
    return (
      <section className="workspace-card">
        <h2>配置したものから商品を探す</h2>

        {children}
      </section>
    );
  return (
    <Dialog title="材料リストから商品を探す" onClose={onClose} wide>
      {children}
    </Dialog>
  );
}
