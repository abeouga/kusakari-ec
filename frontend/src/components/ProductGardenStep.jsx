import { SlidersHorizontal } from 'lucide-react';
import { PlantModelFields } from './PlantModelFields';
import { PlantSuggestionControls } from './PlantSuggestionControls';
import { RangeField } from './RangeField';

/**
 * Garden-object step. The plant height is entered only here and is also the product height shown on the
 * product page, so it stays editable even when no garden object is configured (issue #50).
 * @param {{plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,draft:Record<string,any>,editing:boolean}} props
 */
export function ProductGardenStep({ plant, draft, editing }) {
  return (
    <div className="model-layout">
      <div className="model-preview-pane">
        {plant.previewUrl ? (
          <iframe className="plant-model-preview" title="植物の3Dプレビュー" src={plant.previewUrl} />
        ) : (
          <div className="preview-placeholder">
            {plant.enabled
              ? '設定後に「植物のプレビューを確認」を押してください。'
              : 'AIまたは手動で設定すると、ここで形を確認できます。'}
          </div>
        )}
      </div>
      <div>
        <PlantSuggestionControls plant={plant} imageUrl={draft.imageUrl} editing={editing} draft={draft} />
        {!plant.enabled && (
          <button type="button" className="secondary-button" onClick={() => plant.setEnabled(true)}>
            <SlidersHorizontal className="seller-ui-icon" size={16} aria-hidden="true" />
            手動で設定
          </button>
        )}
        <PlantModelFields
          profile={plant.profile}
          enabled={plant.enabled}
          onEnabledChange={plant.setEnabled}
          onChange={plant.changeProfile}
          onPreview={plant.preview}
          heightControl={
            <>
              <RangeField
                label="植物の高さ（cm・土際から）"
                name="modelHeight"
                min={10}
                max={1500}
                value={plant.height}
                onChange={plant.setHeight}
                required={plant.enabled}
                hint="10〜1500 · 商品ページの高さにも使います"
              />
              {plant.estimated && <p className="ai-estimate">AI推定・実寸未確認。高さを確認してください。</p>}
            </>
          }
        >
          {null}
        </PlantModelFields>
      </div>
    </div>
  );
}
