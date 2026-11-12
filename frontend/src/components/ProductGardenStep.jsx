import { useRef } from 'react';
import { PlantModelFields } from './PlantModelFields';
import { PlantPreview } from './PlantPreview';
import { RangeField } from './RangeField';
import { usePlantPreview } from './usePlantPreview';

/**
 * Garden-object step: the preview with the AI button on the left and the grouped plant features on the right.
 * Plants always have a garden object (issue #49); a product in a non-plant category keeps only its height.
 * @param {{plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>,draft:Record<string,any>,active:boolean}} props
 */
export function ProductGardenStep({ plant, draft, active }) {
  const fields = useRef(/** @type {HTMLDivElement|null} */ (null));
  const preview = usePlantPreview(plant, fields, active);
  if (!plant.plant)
    return (
      <div className="garden-non-plant">
        <p className="preview-placeholder">
          「{draft.category}」の商品は植物の3Dモデルを作りません。庭ではCanvasに登録されたモデルを使います。
        </p>
        <RangeField
          label="商品の高さ"
          name="modelHeight"
          min={10}
          max={1500}
          unit="cm"
          value={plant.height}
          onChange={plant.setHeight}
          hint="商品ページに表示"
        />
      </div>
    );
  return (
    <div className="model-layout">
      <PlantPreview plant={plant} preview={preview} draft={draft} />
      {/*
        A <select> fires input and then change. Re-rendering between them makes React put the controlled value
        back, so the change handler would read the old value and the seller's choice would be lost (issue #116).
        Selects always change the profile on change, so only the other inputs need this validity re-check.
      */}
      <div
        ref={fields}
        onInput={(event) => {
          if (!(event.target instanceof HTMLSelectElement)) preview.edited();
        }}
      >
        {!plant.configured && (
          <p className="fine-print garden-unset">
            この商品は庭オブジェクトが未設定です。特徴を変更すると、保存時に設定されます。
          </p>
        )}
        <PlantModelFields plant={plant} />
      </div>
    </div>
  );
}
