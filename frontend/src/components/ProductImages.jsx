import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api';
/** @param {{main:string,extra:string,onChange:(main:string,extra:string)=>void,onBusy:(busy:boolean)=>void}} props */
export function ProductImages({ main, extra, onChange, onBusy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const urls = [main, ...extra.split('\n')].filter(Boolean);
  /** @param {string[]} next */
  function change(next) {
    onChange(next[0] || '', next.slice(1).join('\n'));
  }
  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  async function upload(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = '';
    if (lock.current || !files.length) return;
    setError('');
    if (files.length + urls.length > 5) {
      setError('画像は最大5枚です。不要な画像を削除してから追加してください。');
      return;
    }
    if (
      files.some(
        (file) =>
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size === 0 ||
          file.size > 5 * 1024 * 1024,
      )
    ) {
      setError('1枚5MB以下のPNG・JPEG・WebPを選択してください。');
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusy(true);
    const next = [...urls];
    try {
      for (const file of files) {
        const saved = await api.uploadProductImage(file);
        next.push(saved.imageUrl);
        change([...next]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画像を追加できませんでした。');
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="product-image-picker" data-testid="product-images">
      <label className="image-drop-label">
        <ImagePlus className="seller-ui-icon" size={16} aria-hidden="true" />
        {busy ? '画像を保存中…' : '画像を追加'}
        <input
          aria-label="商品画像を追加"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={upload}
          disabled={busy || urls.length >= 5}
        />
      </label>
      <p className="fine-print">最大5枚・1枚5MBまで。メイン画像は商品一覧とAI設定に使います。</p>
      {urls.length === 0 && <div className="image-placeholder">商品の写真を選択してください</div>}
      <div className="product-image-thumbnails">
        {urls.map((url, index) => (
          <div key={url} className="product-image-tile">
            <img src={url} alt={`商品画像${index + 1}`} />
            <button
              type="button"
              className="text-button"
              aria-pressed={index === 0}
              onClick={() => change([url, ...urls.filter((_, i) => i !== index)])}
              disabled={busy}
            >
              {index === 0 ? 'メイン画像' : `画像${index + 1}をメインにする`}
            </button>
            <button
              type="button"
              className="text-button"
              aria-label={`商品画像${index + 1}を削除`}
              onClick={() => change(urls.filter((_, i) => i !== index))}
              disabled={busy}
            >
              <Trash2 className="seller-ui-icon" size={16} aria-hidden="true" />
              削除
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
