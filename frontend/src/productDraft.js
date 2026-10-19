import { catalogText } from './catalogText';
/** @type {import('./types').Product} */
export const emptyProduct = {
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
  imageUrl: '',
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
  publishedAt: '',
  active: true,
  publicationStatus: 'PUBLISHED',
  images: [],
};

/** @param {import('./types').Product} product @returns {Record<string,any>} */
export function createDraft(product) {
  return Object.fromEntries(
    Object.entries(product).map(([key, value]) => [
      key,
      key === 'images'
        ? product.images.join('\n')
        : ['description', 'sizeLabel', 'nurseryName', 'nurseryAddress'].includes(key)
          ? catalogText(String(value ?? ''))
          : (value ?? ''),
    ]),
  );
}
/** @param {Record<string,any>} draft @param {number} storeId @param {import('./types').PlantModelProfile|null} plantModelProfile @returns {import('./types').ProductInput} */
export function productInput(draft, storeId, plantModelProfile) {
  /** @type {Record<string,any>} */
  const result = { storeId, plantModelProfile };
  for (const key of [
    'sku',
    'name',
    'latinName',
    'category',
    'description',
    'sizeLabel',
    'care',
    'imageUrl',
    'badge',
    'nurseryName',
    'nurseryAddress',
    'sunlight',
    'useCase',
    'familyName',
  ])
    result[key] = String(draft[key]).trim();
  for (const key of ['priceYen', 'stock', 'careLevel']) result[key] = Number(draft[key]);
  for (const key of ['minTemperatureC', 'ageYears', 'heightCm', 'potDiameterCm'])
    result[key] = draft[key] === '' ? null : Number(draft[key]);
  for (const key of ['heatTolerant', 'droughtTolerant']) result[key] = Boolean(draft[key]);
  result.images = String(draft.images)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return /** @type {import('./types').ProductInput} */ (result);
}
