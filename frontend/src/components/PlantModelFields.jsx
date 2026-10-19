import { useState } from 'react';
import { formText } from '../forms';

/** @type {import('../types').PlantModelProfile} */
const defaults = {
  plantType: 'tree',
  heightCm: 250,
  widthCm: 140,
  crownShape: 'round',
  branchCount: 12,
  branchAngle: 45,
  trunkThicknessCm: 8,
  leafShape: 'oval',
  leafSizeCm: 12,
  leafDensity: 'medium',
  leafColor: '#4f793b',
  flowerEnabled: false,
  flowerShape: 'five',
  flowerSizeCm: 10,
  flowerColor: '#df7799',
  seed: 12345,
};

/** @param {FormData} form @returns {import('../types').PlantModelProfile|null} */
export function readPlantProfile(form) {
  if (!form.has('plantModelEnabled')) return null;
  const heightCm = Number(formText(form, 'heightCm'));
  if (heightCm < 10 || heightCm > 1500)
    throw new Error('植物モデルを設定する場合、高さを10〜1500cmで入力してください。');
  return {
    botanicalForm: formText(form, 'modelBotanicalForm') || null,
    plantType: formText(form, 'modelPlantType'),
    heightCm,
    widthCm: Number(formText(form, 'modelWidthCm')),
    crownShape: formText(form, 'modelCrownShape'),
    branchCount: Number(formText(form, 'modelBranchCount')),
    branchAngle: Number(formText(form, 'modelBranchAngle')),
    trunkThicknessCm: Number(formText(form, 'modelTrunkThicknessCm')),
    leafShape: formText(form, 'modelLeafShape'),
    leafSizeCm: Number(formText(form, 'modelLeafSizeCm')),
    leafDensity: formText(form, 'modelLeafDensity'),
    leafColor: formText(form, 'modelLeafColor'),
    flowerEnabled: form.has('modelFlowerEnabled'),
    flowerShape: formText(form, 'modelFlowerShape'),
    flowerSizeCm: Number(formText(form, 'modelFlowerSizeCm')),
    flowerColor: formText(form, 'modelFlowerColor'),
    seed: Number(formText(form, 'modelSeed')),
  };
}

/** @param {{profile?:import('../types').PlantModelProfile|null}} props */
export function PlantModelFields({ profile }) {
  const p = profile ?? defaults;
  const [enabled, setEnabled] = useState(!!profile);
  const [plantType, setPlantType] = useState(p.plantType);
  const [botanicalForm, setBotanicalForm] = useState(p.botanicalForm ?? '');
  const [leafShape, setLeafShape] = useState(p.leafShape);
  const [flowers, setFlowers] = useState(p.flowerEnabled);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const crownEditable =
    ['tree', 'shrub', 'multistem', 'spreading', 'flower'].includes(plantType) &&
    !['monstera', 'iberis'].includes(botanicalForm);
  const thicknessEditable = !['grass', 'rosette'].includes(plantType);
  const branchEditable = ['tree', 'conifer', 'multistem'].includes(plantType);
  /** @param {string} type */
  function changePlantType(type) {
    setPlantType(type);
    setBotanicalForm('');
    if (type === 'conifer') {
      setLeafShape('needle');
      setFlowers(false);
    } else if (type === 'grass') setLeafShape('grass');
    else if (type === 'palm') {
      setLeafShape('frond');
      setFlowers(false);
    } else if (type === 'rosette') setLeafShape('succulent');
    else if (type === 'vine') setLeafShape('heart');
    else setLeafShape('oval');
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
  /** @param {import('react').MouseEvent<HTMLButtonElement>} event */
  function preview(event) {
    setError('');
    try {
      const form = event.currentTarget.form;
      if (!form) return;
      const value = readPlantProfile(new FormData(form));
      const base = new URL(
        import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/',
        window.location.origin,
      );
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      const url = new URL('model-preview', base);
      url.searchParams.set('profile', JSON.stringify(value));
      setPreviewUrl(url.href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '入力を確認してください。');
    }
  }
  return (
    <fieldset className="form-full plant-model-fields">
      <legend>庭オブジェクト</legend>
      <p className="fine-print">
        「植物の特徴」の高さを共用し、庭で表示する形・枝・葉・花を設定します。販売カテゴリーと植物の形態は、それぞれ販売上の分類と見た目の構成を表します。
      </p>
      <label className="checkbox-label">
        <input
          name="plantModelEnabled"
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setPreviewUrl('');
          }}
        />
        この植物を庭に配置できるようにする
      </label>
      {enabled && (
        <>
          <p className="fine-print">
            高さは「植物の特徴」で土際から最高点までを入力してください（10〜1500cm・鉢を含まない）。幅は葉先を含む最大の横幅です。
          </p>
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
              <label>
                植物の幅（cm）
                <input name="modelWidthCm" type="number" min="10" max="1000" required defaultValue={p.widthCm} />
              </label>
              <label hidden={!crownEditable}>
                全体の形
                <select name="modelCrownShape" defaultValue={p.crownShape}>
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
              <label>
                {['grass', 'flower'].includes(plantType)
                  ? '基本の茎数'
                  : ['palm', 'rosette'].includes(plantType)
                    ? '基本の葉数'
                    : '枝の数'}
                <input name="modelBranchCount" type="number" min="3" max="24" required defaultValue={p.branchCount} />
              </label>
              <label hidden={!branchEditable}>
                枝の角度（度）
                <input name="modelBranchAngle" type="number" min="15" max="80" defaultValue={p.branchAngle} />
              </label>
              <label hidden={!thicknessEditable}>
                {plantType === 'tree' ? '幹の太さ（cm）' : '根元の太さ（cm）'}
                <input
                  name="modelTrunkThicknessCm"
                  type="number"
                  min="0.2"
                  max="100"
                  step="0.1"
                  required
                  defaultValue={p.trunkThicknessCm}
                />
              </label>
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
                    setLeafShape(event.target.value);
                    setBotanicalForm('');
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
              <label>
                {leafShape === 'scale' ? '葉付き小枝の長さ（cm）' : '葉の大きさ（cm）'}
                <input
                  name="modelLeafSizeCm"
                  type="number"
                  min="2"
                  max="80"
                  step="0.1"
                  required
                  defaultValue={p.leafSizeCm}
                />
              </label>
              <label>
                葉の密度
                <select name="modelLeafDensity" defaultValue={p.leafDensity}>
                  <option value="low">少ない</option>
                  <option value="medium">普通</option>
                  <option value="high">多い</option>
                </select>
              </label>
              <label>
                葉の色
                <input name="modelLeafColor" type="color" defaultValue={p.leafColor} />
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
                  onChange={(event) => setFlowers(event.target.checked)}
                />
                花がある
              </label>
              <label hidden={!flowers}>
                花の形
                <select
                  name="modelFlowerShape"
                  defaultValue={p.flowerShape}
                  onChange={() => {
                    if (botanicalForm === 'iberis') setBotanicalForm('');
                  }}
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
              <label hidden={!flowers}>
                花の大きさ（cm）
                <input
                  name="modelFlowerSizeCm"
                  type="number"
                  min="0.3"
                  max="60"
                  step="0.1"
                  defaultValue={p.flowerSizeCm}
                />
              </label>
              <label hidden={!flowers}>
                花の色
                <input name="modelFlowerColor" type="color" defaultValue={p.flowerColor} />
              </label>
              <input name="modelSeed" type="hidden" value={p.seed} />
            </div>
          </fieldset>
          <button className="secondary-button" type="button" onClick={preview}>
            植物のプレビューを確認
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {previewUrl && <iframe className="plant-model-preview" title="植物の3Dプレビュー" src={previewUrl} />}
          <p className="fine-print">
            特徴を変更したらプレビューを確認してください。商品の保存時に植物の構成が確定します。
          </p>
        </>
      )}
    </fieldset>
  );
}
