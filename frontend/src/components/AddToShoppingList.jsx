import { useRef, useState } from 'react';
import { ArrowRight, Check, LoaderCircle, Plus, Search, Sprout } from 'lucide-react';
import { api, yen } from '../api';
import { Dialog } from './Dialog';
import { useShoppingData } from './useShoppingData';

/** @param {{product:import('../types').Product,onClose:()=>void}} props */
export function AddToShoppingList({ product, onClose }) {
  const data = useShoppingData('');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState(/** @type {string[]} */ ([]));
  const [search, setSearch] = useState('');
  const pending = useRef(false);
  const lists = data.lists.filter((list) => list.name.toLowerCase().includes(search.trim().toLowerCase()));

  /** @param {string} gardenId */
  async function add(gardenId) {
    if (pending.current) return;
    pending.current = true;
    setSaving(gardenId);
    setError('');
    try {
      await api.addShoppingListItem(gardenId, product.id);
      setAdded((current) => [...current, gardenId]);
      await data.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '買い物リストに追加できませんでした。');
    } finally {
      pending.current = false;
      setSaving('');
    }
  }

  return (
    <Dialog title="買い物リストに追加" onClose={onClose} className="shopping-picker-dialog">
      <div className="shopping-list-picker">
        <p className="shopping-picker-description">庭の計画に、気になる植物を。</p>
        <div className="shopping-picker-product">
          <img src={product.imageUrl} alt="" />
          <div>
            <small>追加する商品</small>
            <strong>{product.name}</strong>
            <span>
              {yen(product.priceYen)}
              <small>税込 / 1点</small>
            </span>
          </div>
          <span className="shopping-picker-quantity">× 1</span>
        </div>
        <div className="shopping-picker-label">
          <h3>追加先の庭プロジェクト</h3>
          <span>{data.lists.length}件</span>
        </div>
        {data.lists.length > 4 && (
          <label className="shopping-picker-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="庭プロジェクトを検索"
              placeholder="プロジェクト名で検索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        )}
        {data.loading && (
          <p role="status" className="shopping-picker-empty">
            <LoaderCircle size={22} className="shopping-picker-spinner" aria-hidden="true" />
            買い物リストを読み込み中…
          </p>
        )}
        {data.error && (
          <p role="alert">
            {data.error}{' '}
            <button type="button" onClick={data.reload}>
              再取得
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!data.loading && !data.error && !data.lists.length && (
          <div className="shopping-picker-empty">
            <Sprout size={28} aria-hidden="true" />
            <strong>庭プロジェクトがありません</strong>
            <p>Canvasで庭を作成すると、ここに表示されます。</p>
          </div>
        )}
        {!data.loading && !data.error && data.lists.length > 0 && !lists.length && (
          <p className="shopping-picker-empty">一致するプロジェクトがありません。</p>
        )}
        <div className="shopping-list-options" aria-label="追加先の庭プロジェクト">
          {lists.map((list) => {
            const done = added.includes(list.gardenId);
            return (
              <div className={`shopping-list-option${done ? ' is-added' : ''}`} key={list.gardenId}>
                <button
                  type="button"
                  disabled={!!saving || !!data.error || done}
                  onClick={() => add(list.gardenId)}
                  aria-label={`${list.name}の買い物リストに追加`}
                >
                  <img
                    loading="lazy"
                    src={`/api/shopping-lists/${encodeURIComponent(list.gardenId)}/thumbnail?v=${encodeURIComponent(list.thumbnailVersion)}`}
                    alt={`${list.name}の庭のイメージ`}
                  />
                  <span>
                    <strong>{list.name}</strong>
                    <small>
                      {list.productCount}種類・必要数 {list.itemCount}点
                    </small>
                  </span>
                  <span className="shopping-option-action">
                    {saving === list.gardenId ? (
                      <LoaderCircle size={17} className="shopping-picker-spinner" aria-hidden="true" />
                    ) : done ? (
                      <Check size={17} aria-hidden="true" />
                    ) : (
                      <Plus size={17} aria-hidden="true" />
                    )}
                    <small>{saving === list.gardenId ? '追加中' : done ? '追加済み' : '追加'}</small>
                  </span>
                </button>
                {done && (
                  <p role="status">
                    {list.name}に保存しました。
                    <a href={`/cart/gardens/${encodeURIComponent(list.gardenId)}`}>
                      リストを開く
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="shopping-picker-footnote">同じ商品は重複して追加されません。</p>
      </div>
    </Dialog>
  );
}
