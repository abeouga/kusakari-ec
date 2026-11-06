import { PlantShapeFields } from './PlantShapeFields';
import { ChoiceRange, RangeField } from './RangeField';

const LEAF_SHAPES = [
  ['oval', '楕円形'],
  ['narrow', '細長い'],
  ['needle', '針状'],
  ['scale', '鱗片葉の小枝'],
  ['round', '丸葉'],
  ['heart', 'ハート形'],
  ['palmate', '掌状'],
  ['split', '切れ込み葉'],
  ['compound', '複葉'],
  ['succulent', '多肉葉'],
  ['grass', 'グラス葉'],
  ['frond', '羽状葉'],
];

/** Leaf shapes Canvas can grow on each plant type. @param {string} plantType @param {string} shape */
function leafAllowed(plantType, shape) {
  if (plantType === 'conifer') return ['needle', 'scale'].includes(shape);
  if (plantType === 'grass') return shape === 'grass';
  if (plantType === 'palm') return shape === 'frond';
  if (plantType === 'rosette') return ['succulent', 'narrow', 'oval', 'heart', 'round'].includes(shape);
  if (plantType === 'vine') return ['oval', 'round', 'heart', 'palmate', 'split', 'compound'].includes(shape);
  return true;
}

/** @param {{profile:import('../types').PlantModelProfile,onChange:(value:import('../types').PlantModelProfile)=>void}} props */
export function PlantLeafFields({ profile: p, onChange }) {
  return (
    <fieldset className="plant-group">
      <legend>葉</legend>
      <div className="plant-group-grid">
        <label className="plant-select">
          葉の形
          <select
            name="modelLeafShape"
            value={p.leafShape}
            onChange={(event) => onChange({ ...p, leafShape: event.target.value, botanicalForm: null })}
          >
            {LEAF_SHAPES.filter(([value]) => leafAllowed(p.plantType, value)).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="plant-select plant-color">
          葉の色
          <span className="plant-color-value">
            <input
              name="modelLeafColor"
              type="color"
              value={p.leafColor}
              onChange={(event) => onChange({ ...p, leafColor: event.target.value })}
            />
            <span>{p.leafColor}</span>
          </span>
        </label>
        <RangeField
          label={p.leafShape === 'scale' ? '葉付き小枝の長さ' : '葉の大きさ'}
          name="modelLeafSizeCm"
          min={0.5}
          max={200}
          step={0.1}
          unit="cm"
          value={p.leafSizeCm}
          onChange={(value) => onChange({ ...p, leafSizeCm: Number(value) })}
          validOnly
          required
        />
        <ChoiceRange
          label="葉の密度"
          name="modelLeafDensity"
          options={[
            ['sparse', 'とても少ない'],
            ['low', '少ない'],
            ['medium', '普通'],
            ['high', '多い'],
            ['dense', 'とても多い'],
          ]}
          value={p.leafDensity}
          onChange={(value) => onChange({ ...p, leafDensity: value })}
        />
      </div>
      <PlantShapeFields profile={p} group="leaf" onChange={onChange} />
    </fieldset>
  );
}
