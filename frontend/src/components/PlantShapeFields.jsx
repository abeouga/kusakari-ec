import { RangeField } from './RangeField';

// Which shape controls Canvas uses for each growth form (see Canvas plants/growth.py).
const WOODY = ['stemCount', 'stemCurve', 'stemTaper', 'twigLength', 'branchLevels', 'branchDroop', 'branchStart'];
const LEAF = ['leafSizeVariation', 'leafTipRatio', 'leafArrangement'];
/** @type {Record<string,string[]>} */
const FIELDS_BY_TYPE = {
  tree: [...WOODY, ...LEAF],
  conifer: [...WOODY, ...LEAF],
  multistem: [...WOODY, ...LEAF],
  shrub: [...WOODY, ...LEAF],
  spreading: [...WOODY, ...LEAF],
  flower: [...WOODY.slice(1), ...LEAF],
  vine: [...WOODY.slice(1), ...LEAF],
  grass: ['stemCurve', 'branchDroop', 'leafSizeVariation', 'leafTipRatio'],
  rosette: ['branchDroop', 'leafSizeVariation', 'leafTipRatio'],
  palm: ['stemCurve', 'stemTaper', 'branchDroop', 'leafSizeVariation'],
};
// Monstera grows single leaves on petioles: no side shoots or leaf arrangement.
const MONSTERA = ['stemCurve', 'stemTaper', 'branchDroop', 'leafSizeVariation', 'leafTipRatio'];

/**
 * Percent fields are shown as 0-100+ and stored as ratios. `initial` is the value used when the seller turns
 * "automatic" off.
 * @type {Record<string,{label:string,min:number,max:number,percent?:boolean,initial:number,hint?:string}>}
 */
const SPECS = {
  stemCount: { label: '幹・茎の本数', min: 1, max: 12, initial: 3 },
  stemCurve: { label: '幹・茎の曲がり（%）', min: 0, max: 100, percent: true, initial: 0.3 },
  stemTaper: { label: '先端への細まり（%）', min: 0, max: 100, percent: true, initial: 0.6 },
  twigLength: {
    label: '小枝の長さ（%）',
    min: 30,
    max: 150,
    percent: true,
    initial: 1,
    hint: '30〜150 · 親枝に対する長さ。全体の幅は「植物の幅」で決まります',
  },
  branchLevels: { label: '枝分かれの段数', min: 1, max: 3, initial: 2 },
  branchDroop: { label: '枝の垂れ下がり（%）', min: 0, max: 100, percent: true, initial: 0.2 },
  branchStart: { label: '枝が付き始める高さ（%）', min: 5, max: 90, percent: true, initial: 0.3 },
  leafSizeVariation: { label: '葉の大きさのばらつき（%）', min: 0, max: 50, percent: true, initial: 0.15 },
  leafTipRatio: {
    label: '先端の葉の大きさ（%）',
    min: 40,
    max: 160,
    percent: true,
    initial: 0.85,
    hint: '40〜160 · 根元側の葉を100%とした大きさ',
  },
};
const LEAFY_DROOP = new Set(['grass', 'rosette', 'palm']);

/** @param {import('../types').PlantModelProfile} profile @param {'stem'|'leaf'} group */
function fieldsFor(profile, group) {
  const fields = profile.botanicalForm === 'monstera' ? MONSTERA : (FIELDS_BY_TYPE[profile.plantType] ?? []);
  return fields.filter((field) => (group === 'leaf') === field.startsWith('leaf'));
}

/** @param {string} field */
function inputName(field) {
  return `model${field[0].toUpperCase()}${field.slice(1)}`;
}

/** @param {{profile:import('../types').PlantModelProfile,group:'stem'|'leaf',onChange:(value:import('../types').PlantModelProfile)=>void}} props */
export function PlantShapeFields({ profile, group, onChange }) {
  return fieldsFor(profile, group).map((field) => (
    <AutoField key={field} field={field} profile={profile} onChange={onChange} />
  ));
}

/** @param {{field:string,profile:import('../types').PlantModelProfile,onChange:(value:import('../types').PlantModelProfile)=>void}} props */
function AutoField({ field, profile, onChange }) {
  const value = /** @type {Record<string,any>} */ (profile)[field] ?? null;
  const auto = value === null;
  const spec = SPECS[field];
  let label = field === 'leafArrangement' ? '葉の付き方' : spec.label;
  if (field === 'branchDroop' && LEAFY_DROOP.has(profile.plantType)) label = '葉の垂れ下がり（%）';
  if (field === 'branchStart' && ['flower', 'vine'].includes(profile.plantType)) label = '葉が付き始める位置（%）';
  /** @param {any} next */
  const set = (next) => onChange({ ...profile, [field]: next });
  return (
    <div className="auto-field">
      {auto ? (
        <p className="auto-field-value">
          {label}
          <span className="muted">自動（植物タイプ・種類に合わせる）</span>
        </p>
      ) : field === 'leafArrangement' ? (
        <label>
          {label}
          <select name={inputName(field)} value={value} onChange={(event) => set(event.target.value)}>
            <option value="alternate">互生（1枚ずつ互い違い）</option>
            <option value="opposite">対生（2枚ずつ向かい合う）</option>
            <option value="whorled">輪生（3枚ずつ輪状）</option>
          </select>
        </label>
      ) : (
        <RangeField
          label={label}
          name={inputName(field)}
          min={spec.min}
          max={spec.max}
          step={1}
          value={spec.percent ? Math.round(value * 100) : value}
          onChange={(text) => {
            if (text !== '') set(spec.percent ? Number(text) / 100 : Number(text));
          }}
          hint={spec.hint}
          required
        />
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) =>
            set(event.target.checked ? null : field === 'leafArrangement' ? 'alternate' : spec.initial)
          }
        />
        {label}を自動にする
      </label>
    </div>
  );
}
