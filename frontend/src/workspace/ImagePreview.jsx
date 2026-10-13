import { useEffect, useState } from 'react';

export function ImagePreview() {
  const [file, setFile] = useState(/** @type {File|null} */ (null));
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  function choose(event) {
    setError('');
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('PNG・JPEG・WebPの5MB以下の画像を選択してください。');
      return;
    }
    setFile(selected);
  }
  return (
    <div className="form-full">
      <label>
        商品画像ファイル（モック・プレビューのみ）
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <img
            src={preview}
            alt="選択した商品画像のプレビュー"
            style={{ width: 160, height: 140, objectFit: 'contain' }}
          />
          <button type="button" onClick={() => setFile(null)}>
            画像プレビューを削除
          </button>
        </>
      )}
      <p className="fine-print">
        ファイルはサーバーに送信しません。実商品に保存する画像は下のURL欄で登録・変更・削除します。
      </p>
    </div>
  );
}
