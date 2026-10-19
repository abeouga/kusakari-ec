import { useEffect, useState } from 'react';

/** @param {{onFileChange?:(file:File|null)=>void}} props */
export function ImagePreview({ onFileChange } = {}) {
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
    if (!selected) {
      setFile(null);
      onFileChange?.(null);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      event.target.value = '';
      setFile(null);
      onFileChange?.(null);
      setError('PNG・JPEG・WebPの5MB以下の画像を選択してください。');
      return;
    }
    setFile(selected);
    onFileChange?.(selected);
  }
  return (
    <div className="form-full">
      <label>
        商品画像ファイル
        <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} />
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
          <button
            type="button"
            onClick={(event) => {
              setFile(null);
              onFileChange?.(null);
              const input = event.currentTarget.form?.elements.namedItem('imageFile');
              if (input instanceof HTMLInputElement) input.value = '';
            }}
          >
            画像プレビューを削除
          </button>
        </>
      )}
      <p className="fine-print">
        選択ファイルはAI設定の実行時にだけ送信します。実商品に保存する画像は下のURL欄で登録・変更・削除します。
      </p>
    </div>
  );
}
