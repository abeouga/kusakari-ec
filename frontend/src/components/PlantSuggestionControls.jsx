import { Sparkles, Undo2 } from 'lucide-react';
/** @param {{plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,imageUrl:string,editing?:boolean,draft:Record<string,any>}} props */
export function PlantSuggestionControls({ plant, imageUrl, draft }) {
  const image = imageUrl ? '商品のメイン画像' : '写真なし';
  return (
    <div className="plant-ai-controls" aria-busy={plant.busy}>
      <p>商品名・説明・写真から、庭で表示する形・枝・葉・花を推定します。高さが空欄なら仮入力します。</p>
      <label className="checkbox-label">
        <input type="checkbox" checked={plant.includeImage} onChange={(e) => plant.setIncludeImage(e.target.checked)} />
        商品写真をAIに送る
      </label>
      <p className="fine-print">送信する写真：{plant.includeImage ? image : '写真なし'}（最大1枚）</p>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={() => void plant.suggest(draft)}>
          <Sparkles className="seller-ui-icon" size={16} aria-hidden="true" />
          {plant.busy ? 'AIが特徴を推定中…' : 'AIで特徴を設定'}
        </button>
        {plant.undo && (
          <button type="button" className="text-button" onClick={plant.restore}>
            <Undo2 className="seller-ui-icon" size={16} aria-hidden="true" />
            AI設定を元に戻す
          </button>
        )}
      </div>
      {plant.busy && <p role="status">特徴を推定し、3Dで組み立てられるか確認しています。</p>}
      {plant.error && (
        <p className="error" role="alert">
          {plant.error}
        </p>
      )}
      {plant.warnings.length > 0 && (
        <div role="status">
          <p>AIの推定結果を反映しました。必要に応じて修正してください。</p>
          <details>
            <summary>推定の注意点</summary>
            <ul>
              {plant.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
