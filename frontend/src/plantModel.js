import { shapeFields } from './plantSpecies';

/** @type {import('./types').PlantModelProfile} */
export const plantDefaults = {
  botanicalForm: null,
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
  ...Object.fromEntries(shapeFields.map((field) => [field, null])),
};

/**
 * Categories whose products are not plants. Their garden models (e.g. the brick and bench of V3) are Canvas assets,
 * not plant compositions, so the seller form does not build a plant model for them (issue #49).
 */
export const nonPlantCategories = ['鉢・庭材'];

/** @param {string} category */
export function isPlantCategory(category) {
  return !nonPlantCategories.includes(category);
}

/** @param {import('./types').PlantModelProfile} profile */
export function modelPreviewUrl(profile) {
  const base = new URL(import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/', window.location.origin);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const url = new URL('model-preview', base);
  url.searchParams.set('profile', JSON.stringify(profile));
  return url.href;
}
