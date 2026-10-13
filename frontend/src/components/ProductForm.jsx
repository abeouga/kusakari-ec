import { catalogText } from '../catalogText';
import { ImagePreview } from '../workspace/ImagePreview';
import { formText, formNumber, numberValue } from '../forms';

/** @type {import('../types').Product} */
const emptyProduct = {
  id: '',
  sku: '',
  name: '',
  latinName: '',
  category: '庭木',
  description: '',
  sizeLabel: '',
  care: '',
  priceYen: 1000,
  stock: 0,
  unit: 'piece',
  imageUrl: '/images/olive.png',
  badge: '',
  source: 'demo',
  sourceUpdatedAt: '',
  nurseryName: '',
  nurseryAddress: '',
  sunlight: '未設定',
  useCase: '',
  careLevel: 1,
  minTemperatureC: null,
  heatTolerant: false,
  droughtTolerant: false,
  ageYears: null,
  heightCm: null,
  potDiameterCm: null,
  familyName: '',
  floweringDescription: '',
  seasonalCare: '',
  styleDescription: '',
  publishedAt: '',
  active: true,
  images: [],
};

/** @param {{product:import('../types').Product|null,storeId:number,busy:boolean,onSave:(id:string,input:import('../types').ProductInput)=>Promise<boolean|undefined>,onDone:()=>void}} props */
export function ProductForm({ product, storeId, busy, onSave, onDone }) {
  let p = emptyProduct;
  let title = '商品を追加';
  if (product) {
    p = product;
    title = '商品を編集';
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const images = [];
    for (const line of formText(form, 'images').split('\n')) {
      const image = line.trim();
      if (image) images.push(image);
    }
    const saved = await onSave(p.id, {
      storeId,
      sku: formText(form, 'sku'),
      name: formText(form, 'name'),
      latinName: formText(form, 'latinName'),
      category: formText(form, 'category'),
      description: formText(form, 'description'),
      sizeLabel: formText(form, 'sizeLabel'),
      care: formText(form, 'care'),
      priceYen: Number(formText(form, 'priceYen')),
      stock: Number(formText(form, 'stock')),
      imageUrl: formText(form, 'imageUrl'),
      badge: formText(form, 'badge'),
      nurseryName: formText(form, 'nurseryName'),
      nurseryAddress: formText(form, 'nurseryAddress'),
      sunlight: formText(form, 'sunlight'),
      useCase: formText(form, 'useCase'),
      careLevel: Number(formText(form, 'careLevel')),
      minTemperatureC: formNumber(form, 'minTemperatureC'),
      heatTolerant: form.has('heatTolerant'),
      droughtTolerant: form.has('droughtTolerant'),
      ageYears: formNumber(form, 'ageYears'),
      heightCm: formNumber(form, 'heightCm'),
      potDiameterCm: formNumber(form, 'potDiameterCm'),
      familyName: formText(form, 'familyName'),
      floweringDescription: formText(form, 'floweringDescription'),
      seasonalCare: formText(form, 'seasonalCare'),
      styleDescription: formText(form, 'styleDescription'),
      images,
    });
    if (saved) onDone();
  }
  return (
    <form className="basic-form product-form" onSubmit={save}>
      <h3>{title}</h3>
      <div className="form-grid">
        <label>
          商品名
          <input name="name" defaultValue={p.name} required maxLength={120} />
        </label>
        <label>
          商品番号
          <input name="sku" defaultValue={p.sku} required maxLength={50} />
        </label>
        <label>
          学名
          <input name="latinName" defaultValue={p.latinName} maxLength={120} />
        </label>
        <label>
          カテゴリー
          <select name="category" defaultValue={p.category}>
            <option>庭木</option>
            <option>草花</option>
            <option>ハーブ</option>
            <option>観葉植物</option>
            <option>鉢・庭材</option>
            <option>土・ケア用品</option>
            <option>芝</option>
            <option>道具</option>
          </select>
        </label>
        <label>
          税込価格（円）
          <input name="priceYen" type="number" min="1" max="100000" step="1" required defaultValue={p.priceYen} />
        </label>
        <label>
          選択店舗の在庫
          <input name="stock" type="number" min="0" max="10000" step="1" required defaultValue={p.stock} />
        </label>
        <label>
          生産者名
          <input name="nurseryName" defaultValue={catalogText(p.nurseryName)} maxLength={100} />
        </label>
        <label>
          生産者所在地
          <input name="nurseryAddress" defaultValue={catalogText(p.nurseryAddress)} maxLength={200} />
        </label>
        <label>
          サイズ表記
          <input name="sizeLabel" defaultValue={catalogText(p.sizeLabel)} maxLength={80} />
        </label>
        <label>
          商品ラベル
          <input name="badge" defaultValue={p.badge} maxLength={30} />
        </label>
        <label>
          日照条件
          <select name="sunlight" defaultValue={p.sunlight}>
            <option>未設定</option>
            <option>日なた</option>
            <option>半日陰</option>
            <option>日陰</option>
          </select>
        </label>
        <label>
          手入れレベル
          <select name="careLevel" defaultValue={p.careLevel}>
            <option value="1">1：育てやすい</option>
            <option value="2">2：定期的な手入れ</option>
            <option value="3">3：こまめな手入れ</option>
          </select>
        </label>
        <label>
          用途・植栽場所
          <input name="useCase" defaultValue={p.useCase} maxLength={80} />
        </label>
        <label>
          耐寒温度（℃）
          <input
            name="minTemperatureC"
            type="number"
            min="-50"
            max="50"
            defaultValue={numberValue(p.minTemperatureC)}
          />
        </label>
        <label>
          樹齢目安（年）
          <input name="ageYears" type="number" min="0" max="1000" defaultValue={numberValue(p.ageYears)} />
        </label>
        <label>
          高さ（cm・鉢底から）
          <input name="heightCm" type="number" min="1" max="3000" defaultValue={numberValue(p.heightCm)} />
        </label>
        <label>
          鉢径（cm）
          <input name="potDiameterCm" type="number" min="1" max="300" defaultValue={numberValue(p.potDiameterCm)} />
        </label>
        <label>
          科名・属名
          <input name="familyName" defaultValue={p.familyName} maxLength={100} />
        </label>
        <label className="checkbox-label">
          <input name="heatTolerant" type="checkbox" defaultChecked={p.heatTolerant} />
          耐暑性が高い
        </label>
        <label className="checkbox-label">
          <input name="droughtTolerant" type="checkbox" defaultChecked={p.droughtTolerant} />
          乾燥に強い
        </label>
        <label className="form-full">
          商品説明
          <textarea name="description" defaultValue={catalogText(p.description)} required rows={3} maxLength={5000} />
        </label>
        <label className="form-full">
          水やり・育て方
          <textarea name="care" defaultValue={p.care} rows={3} maxLength={5000} />
        </label>
        <label className="form-full">
          開花・結実
          <textarea name="floweringDescription" defaultValue={p.floweringDescription || ''} rows={2} maxLength={5000} />
        </label>
        <label className="form-full">
          季節の育て方
          <textarea name="seasonalCare" defaultValue={p.seasonalCare || ''} rows={3} maxLength={5000} />
        </label>
        <label className="form-full">
          相性のよい庭・空間
          <textarea name="styleDescription" defaultValue={p.styleDescription || ''} rows={2} maxLength={5000} />
        </label>
        <ImagePreview />
        <label className="form-full">
          メイン画像URL
          <input name="imageUrl" defaultValue={p.imageUrl} required maxLength={250} />
        </label>
        <label className="form-full">
          追加画像URL（1行に1つ、最大4枚）
          <textarea name="images" defaultValue={p.images.join('\n')} rows={3} />
        </label>
      </div>
      <p className="fine-print">
        画像は /images/ 内のファイル、または https:// のURLを指定します。在庫は上で選択した店舗のみを更新します。
      </p>
      <button className="primary-button" type="submit" disabled={busy}>
        商品を保存
      </button>
    </form>
  );
}
