// Plant species offered to sellers. Canvas (backend/kusakari_canvas_api/plants/species.py) owns the growth
// rules and rejects incompatible combinations; keep plantType / leafShape / flowerShapes in step with it.
// `preset` is only the seller's starting point: every value stays editable, and shape controls start as automatic.

/** @typedef {{label:string,plantType:string,leafShape:string,flowerShapes:string[],preset:Partial<import('./types').PlantModelProfile>}} PlantSpecies */

/** @type {Record<string, PlantSpecies>} */
export const plantSpecies = {
  maple: {
    label: 'イロハモミジ',
    plantType: 'tree',
    leafShape: 'palmate',
    flowerShapes: [],
    preset: { crownShape: 'spreading', branchCount: 14, branchAngle: 60, leafSizeCm: 7, leafColor: '#467441' },
  },
  olive: {
    label: 'オリーブ',
    plantType: 'tree',
    leafShape: 'narrow',
    flowerShapes: ['cluster'],
    preset: { crownShape: 'round', branchCount: 12, branchAngle: 50, leafSizeCm: 6, leafColor: '#7d8f6a' },
  },
  goldcrest: {
    label: 'ゴールドクレスト',
    plantType: 'conifer',
    leafShape: 'scale',
    flowerShapes: [],
    preset: { crownShape: 'conical', branchCount: 14, branchAngle: 55, leafSizeCm: 6, leafColor: '#9fbf3f' },
  },
  rose: {
    label: 'バラ',
    plantType: 'shrub',
    leafShape: 'compound',
    flowerShapes: ['five', 'eight'],
    preset: {
      branchCount: 12,
      branchAngle: 40,
      leafSizeCm: 8,
      flowerEnabled: true,
      flowerShape: 'eight',
      flowerSizeCm: 8,
      flowerColor: '#d23a5b',
    },
  },
  hydrangea: {
    label: 'アジサイ',
    plantType: 'shrub',
    leafShape: 'oval',
    flowerShapes: ['cluster'],
    preset: {
      branchCount: 12,
      branchAngle: 40,
      leafSizeCm: 12,
      flowerEnabled: true,
      flowerShape: 'cluster',
      flowerSizeCm: 16,
      flowerColor: '#7b93d6',
    },
  },
  lavender: {
    label: 'ラベンダー',
    plantType: 'shrub',
    leafShape: 'narrow',
    flowerShapes: ['spike'],
    preset: {
      branchCount: 16,
      branchAngle: 30,
      leafSizeCm: 4,
      leafColor: '#8a9a7b',
      flowerEnabled: true,
      flowerShape: 'spike',
      flowerSizeCm: 5,
      flowerColor: '#8e6fc1',
    },
  },
  boxwood: {
    label: 'ツゲ',
    plantType: 'shrub',
    leafShape: 'round',
    flowerShapes: [],
    preset: {
      crownShape: 'round',
      branchCount: 16,
      branchAngle: 45,
      leafSizeCm: 2.5,
      leafDensity: 'dense',
      leafColor: '#3f6a2e',
    },
  },
  iberis: {
    label: 'イベリス',
    plantType: 'spreading',
    leafShape: 'narrow',
    flowerShapes: ['four'],
    preset: {
      branchCount: 12,
      leafSizeCm: 3,
      flowerEnabled: true,
      flowerShape: 'four',
      flowerSizeCm: 3,
      flowerColor: '#f4f1f6',
    },
  },
  monstera: {
    label: 'モンステラ',
    plantType: 'flower',
    leafShape: 'split',
    flowerShapes: [],
    preset: { branchCount: 8, leafSizeCm: 30, leafColor: '#2f6b35' },
  },
  hakone: {
    label: 'フウチソウ',
    plantType: 'grass',
    leafShape: 'grass',
    flowerShapes: ['four', 'five', 'eight', 'spike', 'cluster', 'daisy', 'bell', 'plume'],
    preset: { branchCount: 14, leafSizeCm: 20, leafColor: '#8fb34a' },
  },
  hosta: {
    label: 'ギボウシ',
    plantType: 'rosette',
    leafShape: 'heart',
    flowerShapes: ['bell'],
    preset: {
      branchCount: 10,
      leafSizeCm: 18,
      flowerEnabled: true,
      flowerShape: 'bell',
      flowerSizeCm: 3,
      flowerColor: '#b9a3e3',
    },
  },
};

/** Shape controls that can be left automatic (null). */
export const shapeFields = /** @type {const} */ ([
  'stemCount',
  'stemCurve',
  'stemTaper',
  'twigLength',
  'branchLevels',
  'branchDroop',
  'branchStart',
  'leafSizeVariation',
  'leafTipRatio',
  'leafArrangement',
]);

/**
 * Starts a species from the current profile: keeps the seller's size and seed, applies the preset, resets shape
 * controls to automatic so Canvas applies the species' own growth values.
 * @param {import('./types').PlantModelProfile} profile @param {string} id
 * @returns {import('./types').PlantModelProfile}
 */
export function applySpecies(profile, id) {
  const species = plantSpecies[id];
  if (!species) return { ...profile, botanicalForm: null };
  const automatic = Object.fromEntries(shapeFields.map((field) => [field, null]));
  const flowerShape = species.flowerShapes.includes(profile.flowerShape)
    ? profile.flowerShape
    : (species.flowerShapes[0] ?? profile.flowerShape);
  return {
    ...profile,
    ...automatic,
    flowerEnabled: false,
    flowerShape,
    ...species.preset,
    botanicalForm: id,
    plantType: species.plantType,
    leafShape: species.leafShape,
  };
}
