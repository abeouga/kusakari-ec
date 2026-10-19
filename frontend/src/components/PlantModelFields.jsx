import { ChoiceRange, RangeField } from './RangeField';
export { readPlantProfile } from '../plantModel';

/** @param {{profile:import('../types').PlantModelProfile,enabled:boolean,onEnabledChange:(value:boolean)=>void,onChange:(value:import('../types').PlantModelProfile)=>void,onPreview:()=>void,heightControl:import('react').ReactNode,children:import('react').ReactNode}} props */
export function PlantModelFields({
  profile: p,
  enabled,
  onEnabledChange,
  onChange,
  onPreview,
  heightControl,
  children,
}) {
  const { plantType, leafShape, flowerEnabled: flowers } = p;
  const botanicalForm = p.botanicalForm ?? '';
  const crownEditable =
    ['tree', 'shrub', 'multistem', 'spreading', 'flower'].includes(plantType) &&
    !['monstera', 'iberis'].includes(botanicalForm);
  const thicknessEditable = !['grass', 'rosette'].includes(plantType);
  const branchEditable = ['tree', 'conifer', 'multistem'].includes(plantType);
  /** @param {string} type */
  function changePlantType(type) {
    /** @type {Record<string,string>} */
    const leaves = { conifer: 'needle', grass: 'grass', palm: 'frond', rosette: 'succulent', vine: 'heart' };
    onChange({
      ...p,
      plantType: type,
      botanicalForm: null,
      leafShape: leaves[type] || 'oval',
      flowerEnabled: ['conifer', 'palm'].includes(type) ? false : flowers,
    });
  }
  /** @param {string} shape */
  function leafAllowed(shape) {
    if (plantType === 'conifer') return ['needle', 'scale'].includes(shape);
    if (plantType === 'grass') return shape === 'grass';
    if (plantType === 'palm') return shape === 'frond';
    if (plantType === 'rosette') return ['succulent', 'narrow', 'oval'].includes(shape);
    if (plantType === 'vine') return ['oval', 'round', 'heart', 'palmate', 'split', 'compound'].includes(shape);
    return true;
  }
  return (
    <fieldset className="form-full plant-model-fields">
      <legend>庭オブジェクト</legend>

      <label className="checkbox-label">
        <input
          name="plantModelEnabled"
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            onEnabledChange(event.target.checked);
          }}
        />
        この植物を庭に配置できるようにする
      </label>
      {children}
      <div className="model-size-grid">
        {heightControl}
        {enabled && (
          <RangeField
            label={'植物の幅（cm）'}
            name="modelWidthCm"
            min={10}
            max={1000}
            step={1}
            value={p.widthCm}
            onChange={(value) => onChange({ ...p, widthCm: Number(value) })}
            required
          />
        )}
      </div>
      <fieldset disabled={!enabled} hidden={!enabled} className="plant-model-inputs">
        <details className="model-details">
          <summary>詳細を調整</summary>
          <input type="hidden" name="modelBotanicalForm" value={botanicalForm} />
          {botanicalForm && (
            <p className="fine-print">
              植物別の組立規則：
              {
                {
                  maple: 'イロハモミジ',
                  monstera: 'モンステラ',
                  iberis: 'イベリス',
                  hakone: 'フウチソウ',
                  goldcrest: 'ゴールドクレスト',
                }[botanicalForm]
              }
              。植物タイプ・葉の形を変更すると汎用の組み立てに戻ります。
            </p>
          )}
          <fieldset className="plant-model-group">
            <legend>全体の形・大きさ</legend>
            <div className="form-grid">
              <label>
                植物タイプ
                <select
                  name="modelPlantType"
                  value={plantType}
                  onChange={(event) => changePlantType(event.target.value)}
                >
                  <option value="tree">樹木</option>
                  <option value="shrub">低木</option>
                  <option value="flower">草花</option>
                  <option value="conifer">針葉樹</option>
                  <option value="multistem">株立ち樹木</option>
                  <option value="spreading">横広がり低木</option>
                  <option value="grass">グラス</option>
                  <option value="rosette">ロゼット・多肉</option>
                  <option value="vine">つる植物</option>
                  <option value="palm">ヤシ</option>
                </select>
              </label>

              <label hidden={!crownEditable}>
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

          <fieldset className="plant-model-group">
            <legend>幹・枝・茎</legend>
            <div className="form-grid">
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
                step={1}
                value={p.branchCount}
                onChange={(value) => onChange({ ...p, branchCount: Number(value) })}
                required
              />
              <div hidden={!branchEditable}>
                <RangeField
                  label={'枝の角度（度）'}
                  name="modelBranchAngle"
                  min={15}
                  max={80}
                  step={1}
                  value={p.branchAngle}
                  onChange={(value) => onChange({ ...p, branchAngle: Number(value) })}
                  required
                />
              </div>
              <div hidden={!thicknessEditable}>
                <RangeField
                  label={plantType === 'tree' ? '幹の太さ（cm）' : '根元の太さ（cm）'}
                  name="modelTrunkThicknessCm"
                  min={0.2}
                  max={100}
                  step={0.1}
                  value={p.trunkThicknessCm}
                  onChange={(value) => onChange({ ...p, trunkThicknessCm: Number(value) })}
                  required
                />
              </div>
            </div>
          </fieldset>
          <fieldset className="plant-model-group">
            <legend>葉</legend>
            <div className="form-grid">
              <label>
                葉の形
                <select
                  name="modelLeafShape"
                  value={leafShape}
                  onChange={(event) => {
                    onChange({ ...p, leafShape: event.target.value, botanicalForm: null });
                  }}
                >
                  {[
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
                  ]
                    .filter(([value]) => leafAllowed(value))
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <RangeField
                label={leafShape === 'scale' ? '葉付き小枝の長さ（cm）' : '葉の大きさ（cm）'}
                name="modelLeafSizeCm"
                min={2}
                max={80}
                step={0.1}
                value={p.leafSizeCm}
                onChange={(value) => onChange({ ...p, leafSizeCm: Number(value) })}
                required
              />
              <ChoiceRange
                label="葉の密度"
                name="modelLeafDensity"
                options={[
                  ['low', '少ない'],
                  ['medium', '普通'],
                  ['high', '多い'],
                ]}
                value={p.leafDensity}
                onChange={(value) => onChange({ ...p, leafDensity: value })}
              />
              <label>
                葉の色
                <input
                  name="modelLeafColor"
                  type="color"
                  value={p.leafColor}
                  onChange={(event) => onChange({ ...p, leafColor: event.target.value })}
                />
              </label>
            </div>
          </fieldset>
          <fieldset className="plant-model-group">
            <legend>花</legend>
            <div className="form-grid">
              <label className="checkbox-label">
                <input
                  name="modelFlowerEnabled"
                  type="checkbox"
                  checked={flowers}
                  disabled={
                    plantType === 'conifer' || plantType === 'palm' || ['maple', 'monstera'].includes(botanicalForm)
                  }
                  onChange={(event) => onChange({ ...p, flowerEnabled: event.target.checked })}
                />
                花がある
              </label>
              <label hidden={!flowers}>
                花の形
                <select
                  name="modelFlowerShape"
                  value={p.flowerShape}
                  onChange={(event) =>
                    onChange({
                      ...p,
                      flowerShape: event.target.value,
                      botanicalForm: botanicalForm === 'iberis' ? null : p.botanicalForm,
                    })
                  }
                >
                  <option value="four">4枚の花弁</option>
                  <option value="five">5枚の花弁</option>
                  <option value="eight">8枚の花弁</option>
                  <option value="spike">穂状</option>
                  <option value="cluster">房状</option>
                  <option value="daisy">キク状</option>
                  <option value="bell">ベル状</option>
                  <option value="plume">羽毛状</option>
                </select>
              </label>
              <div hidden={!flowers}>
                <RangeField
                  label={'花の大きさ（cm）'}
                  name="modelFlowerSizeCm"
                  min={0.3}
                  max={60}
                  step={0.1}
                  value={p.flowerSizeCm}
                  onChange={(value) => onChange({ ...p, flowerSizeCm: Number(value) })}
                  required
                />
              </div>
              <label hidden={!flowers}>
                花の色
                <input
                  name="modelFlowerColor"
                  type="color"
                  value={p.flowerColor}
                  onChange={(event) => onChange({ ...p, flowerColor: event.target.value })}
                />
              </label>
              <input name="modelSeed" type="hidden" value={p.seed} />
            </div>
          </fieldset>
        </details>
        <button className="secondary-button" type="button" onClick={onPreview}>
          植物のプレビューを確認
        </button>

        <p className="fine-print">
          特徴を変更したらプレビューを確認してください。商品の保存時に植物の構成が確定します。
        </p>
      </fieldset>
    </fieldset>
  );
}
