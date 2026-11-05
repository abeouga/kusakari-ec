import { useState } from 'react';
import { api } from '../api';
import { isPlantCategory, plantDefaults } from '../plantModel';

/** @param {Blob} blob @returns {Promise<string>} */
function dataUrl(blob) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > 5 * 1024 * 1024)
    throw new Error('AIに送る写真はPNG・JPEG・WebPの5MB以下にしてください。');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('写真を読み込めませんでした。'));
    reader.readAsDataURL(blob);
  });
}

/** The main image is always sent when there is one (issue #48). @param {string} source */
async function photo(source) {
  if (!source) return { imageUrl: null, imageDataUrl: null };
  if (/^\/images\/[a-zA-Z0-9_.-]+$|^\/api\/product-images\/[a-f0-9-]{36}$/.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error('商品写真を取得できません。「画像」で画像を選び直してください。');
    return { imageUrl: null, imageDataUrl: await dataUrl(await response.blob()) };
  }
  if (source.startsWith('https://')) return { imageUrl: source, imageDataUrl: null };
  throw new Error('商品写真を読み込めません。「画像」で画像を選び直してください。');
}

/**
 * Garden-object state of the product form. Plants always get a garden object (issue #49): a new plant product saves
 * its profile, and products already saved with one keep it. Two cases keep `plantModelProfile` null so that saving
 * does not change existing data: products in a non-plant category, and existing products saved without a model until
 * the seller changes a feature or uses the AI.
 * @param {import('../types').Product} product @param {boolean} editing @param {string} category
 */
export function usePlantSuggestion(product, editing, category) {
  const saved = product.plantModelProfile ?? null;
  const [profile, setProfile] = useState(saved ?? plantDefaults);
  const [touched, setTouched] = useState(false);
  const [height, setHeightValue] = useState(String(product.heightCm ?? saved?.heightCm ?? ''));
  const [estimated, setEstimated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState(/** @type {string[]} */ ([]));
  const [undo, setUndo] = useState(
    /** @type {{profile:import('../types').PlantModelProfile,touched:boolean,height:string,estimated:boolean,warnings:string[]}|null} */ (
      null
    ),
  );
  const plant = !!saved || isPlantCategory(category);
  const configured = plant && (!editing || !!saved || touched);

  /** @param {string} value */
  function setHeight(value) {
    setHeightValue(value);
    setEstimated(false);
  }
  /** @param {import('../types').PlantModelProfile} value */
  function changeProfile(value) {
    setProfile(value);
    setTouched(true);
  }
  /** The profile to save, or null when this product keeps no garden object. */
  function currentProfile() {
    if (!configured) return null;
    const heightCm = Number(height);
    if (height === '' || !Number.isInteger(heightCm) || heightCm < 10 || heightCm > 1500)
      throw new Error('植物の高さは10〜1500cmの整数にしてください。');
    return { ...profile, heightCm };
  }
  /** @param {Record<string,any>} values */
  async function suggest(values) {
    if (busy) return;
    const name = String(values.name).trim();
    setError('');
    if (!name) {
      setError('AIで生成する前に商品名を入力してください。');
      return;
    }
    const heightCm = height === '' ? null : Number(height);
    if (heightCm !== null && (!Number.isInteger(heightCm) || heightCm < 10 || heightCm > 1500)) {
      setError('植物の高さは10〜1500cmの整数にしてください。');
      return;
    }
    const snapshot = { profile, touched, height, estimated, warnings };
    setBusy(true);
    try {
      const result = await api.suggestPlantModel({
        name,
        latinName: String(values.latinName),
        category: String(values.category),
        description: String(values.description),
        heightCm,
        currentProfile: profile,
        ...(await photo(String(values.imageUrl))),
      });
      setUndo(snapshot);
      setProfile(result.profile);
      setTouched(true);
      setHeightValue(String(result.profile.heightCm));
      setEstimated(heightCm === null || estimated);
      setWarnings(result.warnings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AIで特徴を推定できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  function restore() {
    if (!undo) return;
    setProfile(undo.profile);
    setTouched(undo.touched);
    setHeightValue(undo.height);
    setEstimated(undo.estimated);
    setWarnings(undo.warnings);
    setUndo(null);
    setError('');
  }
  return {
    profile,
    currentProfile,
    plant,
    configured,
    height,
    setHeight,
    estimated,
    busy,
    error,
    warnings,
    undo,
    restore,
    suggest,
    changeProfile,
  };
}
