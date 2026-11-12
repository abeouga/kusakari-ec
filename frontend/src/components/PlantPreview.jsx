import { Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * 3D preview of the garden object with the AI button laid over its lower right corner, like Canvas's
 * 「AIで生成」 (issue #48). The AI result, its warnings and the undo stay right below the preview.
 * @param {{plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,preview:ReturnType<import('./usePlantPreview').usePlantPreview>,draft:Record<string,any>}} props
 */
export function PlantPreview({ plant, preview, draft }) {
  const { shown, pending, stale } = preview;
  const button = useRef(/** @type {HTMLButtonElement|null} */ (null));
  // The form is disabled while the AI works, which drops the focus; give it back to the button afterwards.
  const refocus = useRef(false);
  useEffect(() => {
    if (plant.busy || !refocus.current) return;
    refocus.current = false;
    button.current?.focus();
  }, [plant.busy]);
  return (
    <div className="model-preview-pane">
      <div className="plant-preview-surface" aria-busy={plant.busy}>
        {/* One keyed list, so the frame that finished loading is never moved (moving an iframe reloads it). */}
        {[shown, pending].filter(Boolean).map((url) => {
          // The frame loading behind the shown one is out of the Tab order and the accessibility tree until swapped.
          const behind = url !== shown && !!shown;
          return (
            <iframe
              key={url}
              className="plant-model-preview"
              data-loading={behind ? 'true' : undefined}
              title={behind ? '植物の3Dプレビュー（更新中）' : '植物の3Dプレビュー'}
              tabIndex={behind ? -1 : undefined}
              aria-hidden={behind ? true : undefined}
              src={url}
              onLoad={url === shown ? undefined : () => preview.loaded(url)}
            />
          );
        })}
        {!shown && !pending && (
          <p className="preview-placeholder">
            {plant.configured
              ? '植物の高さを入力すると、ここに3Dで表示します。'
              : '特徴を変更するか「AIで生成」を押すと、庭オブジェクトを設定します。'}
          </p>
        )}
        {stale && shown && (
          <span className="plant-preview-badge" role="status">
            入力を直すと更新します
          </span>
        )}
        {plant.busy && (
          <div className="plant-preview-busy" role="status">
            <span className="plant-preview-ring" aria-hidden="true" />
            AIが特徴を推定しています…
          </div>
        )}
        <button
          ref={button}
          type="button"
          className="plant-ai-button"
          aria-label="AIで生成"
          onClick={() => {
            refocus.current = document.activeElement === button.current;
            void plant.suggest(draft);
          }}
        >
          <Sparkles size={16} aria-hidden="true" />
          {plant.busy ? '推定中…' : 'AIで生成'}
        </button>
      </div>
      {preview.approximateHeight !== null && (
        <p className="muted plant-preview-height-hint">
          高さ未入力のため、{preview.approximateHeight}cmで仮表示しています。出品前に実際の高さを入力してください。
        </p>
      )}
      {plant.error && (
        <p className="error plant-ai-error" role="alert">
          {plant.error}
        </p>
      )}
      {(plant.warnings.length > 0 || plant.undo) && (
        <div className="plant-ai-result">
          {plant.warnings.length > 0 && (
            <details>
              <summary>AIの推定を反映しました · 注意点</summary>
              <ul>
                {plant.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          {plant.undo && (
            <button type="button" className="text-button" onClick={plant.restore}>
              <Undo2 className="seller-ui-icon" size={14} aria-hidden="true" />
              AI設定を元に戻す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
