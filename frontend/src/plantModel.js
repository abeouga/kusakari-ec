import { formText } from './forms';

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
};

/** @param {FormData} form @returns {import('./types').PlantModelProfile|null} */
export function readPlantProfile(form) {
  if (!form.has('plantModelEnabled')) return null;
  const heightCm = Number(formText(form, 'heightCm'));
  if (!Number.isInteger(heightCm) || heightCm < 10 || heightCm > 1500)
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

/** @param {import('./types').PlantModelProfile} profile */
export function modelPreviewUrl(profile) {
  const base = new URL(import.meta.env.VITE_KUSAKARI_CANVAS_URL || 'http://127.0.0.1:5173/', window.location.origin);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const url = new URL('model-preview', base);
  url.searchParams.set('profile', JSON.stringify(profile));
  return url.href;
}
