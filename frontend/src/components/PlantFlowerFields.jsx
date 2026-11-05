import { Check } from 'lucide-react';
import { useId } from 'react';
import { plantSpecies } from '../plantSpecies';
import { RangeField } from './RangeField';

const FLOWER_SHAPES = [
  ['four', '4枚の花弁'],
  ['five', '5枚の花弁'],
  ['eight', '8枚の花弁'],
  ['spike', '穂状'],
  ['cluster', '房状'],
  ['daisy', 'キク状'],
  ['bell', 'ベル状'],
  ['plume', '羽毛状'],
];

/**
 * Named swatches for the flower colour (issue #52). They include the species presets, so a preset shows its name;
 * any other saved colour (e.g. from the AI) stays as it is and is shown as 「その他」.
 */
const FLOWER_COLORS = [
  ['#df7799', 'ピンク'],
  ['#d23a5b', '赤'],
  ['#f08a3c', 'オレンジ'],
  ['#f2c94c', '黄'],
  ['#f4f1f6', '白'],
  ['#b9a3e3', '薄紫'],
  ['#8e6fc1', '紫'],
  ['#7b93d6', '青紫'],
];

/** @param {{profile:import('../types').PlantModelProfile,onChange:(value:import('../types').PlantModelProfile)=>void}} props */
export function PlantFlowerFields({ profile: p, onChange }) {
  const group = useId();
  const species = p.botanicalForm ? plantSpecies[p.botanicalForm] : null;
  const speciesFlowers = species ? species.flowerShapes : null;
  const unavailable = p.plantType === 'conifer' || p.plantType === 'palm' || speciesFlowers?.length === 0;
  const color = p.flowerColor.toLowerCase();
  const named = FLOWER_COLORS.find(([hex]) => hex === color);
  return (
    <fieldset className="plant-group">
      <legend>花</legend>
      <label className="plant-switch">
        <input
          name="modelFlowerEnabled"
          type="checkbox"
          role="switch"
          checked={p.flowerEnabled}
          disabled={unavailable}
          onChange={(event) => onChange({ ...p, flowerEnabled: event.target.checked })}
        />
        花を付ける
        {unavailable && <small className="muted">この植物タイプ・種類には付けられません</small>}
      </label>
      <div className="plant-group-grid" hidden={!p.flowerEnabled}>
        <label className="plant-select">
          花の形
          <select
            name="modelFlowerShape"
            value={p.flowerShape}
            onChange={(event) => onChange({ ...p, flowerShape: event.target.value })}
          >
            {FLOWER_SHAPES.filter(([value]) => !speciesFlowers || speciesFlowers.includes(value)).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        <RangeField
          label="花の大きさ"
          name="modelFlowerSizeCm"
          min={0.3}
          max={60}
          step={0.1}
          unit="cm"
          value={p.flowerSizeCm}
          onChange={(value) => onChange({ ...p, flowerSizeCm: Number(value) })}
          required
        />
        <fieldset className="flower-colors">
          <legend>
            花の色<span>{named ? named[1] : `その他（${color}）`}</span>
          </legend>
          <div className="flower-swatches">
            {FLOWER_COLORS.map(([hex, name]) => (
              <label key={hex} className="flower-swatch" title={name} style={{ background: hex }}>
                <input
                  type="radio"
                  name={group}
                  value={hex}
                  checked={hex === color}
                  onChange={() => onChange({ ...p, flowerColor: hex })}
                />
                <span className="visually-hidden">{name}</span>
                {hex === color && <Check size={14} strokeWidth={3} aria-hidden="true" />}
              </label>
            ))}
            <label className="flower-swatch flower-swatch-custom" data-checked={!named} title="その他の色">
              <input
                name="modelFlowerColor"
                type="color"
                aria-label="その他の色"
                value={color}
                onChange={(event) => onChange({ ...p, flowerColor: event.target.value })}
              />
            </label>
          </div>
        </fieldset>
      </div>
    </fieldset>
  );
}
