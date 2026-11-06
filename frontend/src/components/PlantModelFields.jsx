import { applySpecies, plantSpecies } from '../plantSpecies';
import { PlantFlowerFields } from './PlantFlowerFields';
import { PlantLeafFields } from './PlantLeafFields';
import { PlantShapeFields } from './PlantShapeFields';
import { RangeField } from './RangeField';

const PLANT_TYPES = [
  ['tree', '樹木'],
  ['shrub', '低木'],
  ['flower', '草花'],
  ['conifer', '針葉樹'],
  ['multistem', '株立ち樹木'],
  ['spreading', '横広がり低木'],
  ['grass', 'グラス'],
  ['rosette', 'ロゼット・多肉'],
  ['vine', 'つる植物'],
  ['palm', 'ヤシ'],
];

/**
 * Plant features grouped as サイズ / 形 / 枝・茎 / 葉 / 花 (issue #52). Only the layout changed: every input and
 * every saved `plantModelProfile` value is the same as before.
 * @param {{plant:ReturnType<import('./usePlantSuggestion').usePlantSuggestion>}} props
 */
export function PlantModelFields({ plant }) {
  const { profile: p, changeProfile: onChange } = plant;
  const { plantType } = p;
  const botanicalForm = p.botanicalForm ?? '';
  const crownEditable =
    ['tree', 'shrub', 'multistem', 'spreading', 'flower'].includes(plantType) &&
    !['monstera', 'iberis'].includes(botanicalForm);
  const thicknessEditable = !['grass', 'rosette'].includes(plantType);
  const branchEditable = !['grass', 'rosette', 'palm'].includes(plantType) && botanicalForm !== 'monstera';
  /** @param {string} type */
  function changePlantType(type) {
    /** @type {Record<string,string>} */
    const leaves = { conifer: 'needle', grass: 'grass', palm: 'frond', rosette: 'succulent', vine: 'heart' };
    onChange({
      ...p,
      plantType: type,
      botanicalForm: null,
      leafShape: leaves[type] || 'oval',
      flowerEnabled: ['conifer', 'palm'].includes(type) ? false : p.flowerEnabled,
    });
  }
  return (
    <div className="plant-model-fields">
      <fieldset className="plant-group">
        <legend>サイズ</legend>
        <div className="plant-group-grid">
          <RangeField
            label="植物の高さ"
            name="modelHeight"
            min={10}
            max={1500}
            unit="cm"
            value={plant.height}
            onChange={plant.setHeight}
            required={plant.configured}
            hint="土際から · 商品ページにも表示"
          />
          <RangeField
            label="植物の幅"
            name="modelWidthCm"
            min={10}
            max={1000}
            unit="cm"
            value={p.widthCm}
            onChange={(value) => onChange({ ...p, widthCm: Number(value) })}
            validOnly
            required
          />
          {plant.estimated && <p className="ai-estimate">AI推定・実寸未確認。高さを確認してください。</p>}
        </div>
      </fieldset>

      <fieldset className="plant-group">
        <legend>形</legend>
        <div className="plant-group-grid">
          <div className="plant-select">
            <label>
              植物の種類
              <select
                name="modelBotanicalForm"
                value={botanicalForm}
                onChange={(event) => onChange(applySpecies(p, event.target.value))}
              >
                <option value="">指定しない</option>
                {Object.entries(plantSpecies).map(([id, item]) => (
                  <option key={id} value={id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <small className="muted">選ぶとその植物の育ち方で組み立てます</small>
          </div>
          <label className="plant-select">
            植物タイプ
            <select name="modelPlantType" value={plantType} onChange={(event) => changePlantType(event.target.value)}>
              {PLANT_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="plant-select" hidden={!crownEditable}>
            全体の形
            <select
              name="modelCrownShape"
              value={p.crownShape}
              onChange={(event) => onChange({ ...p, crownShape: event.target.value })}
            >
              <option value="round">丸い</option>
              <option value="conical">円錐形</option>
              <option value="spreading">広がる形</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="plant-group">
        <legend>枝・茎</legend>
        <div className="plant-group-grid">
          <RangeField
            label={
              ['grass', 'flower'].includes(plantType)
                ? '基本の茎数'
                : ['palm', 'rosette'].includes(plantType)
                  ? '基本の葉数'
                  : '枝の数'
            }
            name="modelBranchCount"
            min={3}
            max={24}
            unit="本"
            value={p.branchCount}
            onChange={(value) => onChange({ ...p, branchCount: Number(value) })}
            validOnly
            required
          />
          <div hidden={!branchEditable}>
            <RangeField
              label="枝の角度"
              name="modelBranchAngle"
              min={15}
              max={80}
              unit="度"
              value={p.branchAngle}
              onChange={(value) => onChange({ ...p, branchAngle: Number(value) })}
              validOnly
              required
            />
          </div>
          <div hidden={!thicknessEditable}>
            <RangeField
              label={plantType === 'tree' ? '幹の太さ' : '根元の太さ'}
              name="modelTrunkThicknessCm"
              min={0.2}
              max={100}
              step={0.1}
              unit="cm"
              value={p.trunkThicknessCm}
              onChange={(value) => onChange({ ...p, trunkThicknessCm: Number(value) })}
              validOnly
              required
            />
          </div>
        </div>
        <PlantShapeFields profile={p} group="stem" onChange={onChange} />
      </fieldset>

      <PlantLeafFields profile={p} onChange={onChange} />
      <PlantFlowerFields profile={p} onChange={onChange} />
      <input name="modelSeed" type="hidden" value={p.seed} />
    </div>
  );
}
