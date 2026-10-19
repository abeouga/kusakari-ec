import { useState } from 'react';
import { api } from '../api';
import { modelPreviewUrl, plantDefaults } from '../plantModel';

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

/** @param {import('../types').Product} product @param {boolean} _editing */
export function usePlantSuggestion(product, _editing) {
  const [profile, setProfile] = useState(product.plantModelProfile ?? plantDefaults);
  const [enabled, setEnabled] = useState(!!product.plantModelProfile);
  const [height, setHeightValue] = useState(String(product.heightCm ?? product.plantModelProfile?.heightCm ?? ''));
  const [estimated, setEstimated] = useState(false);
  const [includeImage, setIncludeImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState(/** @type {string[]} */ ([]));
  const [previewUrl, setPreviewUrl] = useState('');
  const [revision, setRevision] = useState(0);
  const [undo, setUndo] = useState(
    /** @type {{profile:import('../types').PlantModelProfile,enabled:boolean,height:string,estimated:boolean,previewUrl:string,warnings:string[]}|null} */ (
      null
    ),
  );

  /** @param {string} value */
  function setHeight(value) {
    setHeightValue(value);
    setEstimated(false);
    setPreviewUrl('');
  }
  /** @param {import('../types').PlantModelProfile} value */
  function changeProfile(value) {
    setProfile(value);
    setPreviewUrl('');
  }
  function currentProfile() {
    if (!enabled) return null;
    const heightCm = Number(height);
    if (!Number.isInteger(heightCm) || heightCm < 10 || heightCm > 1500)
      throw new Error('庭オブジェクトの高さは10〜1500cmにしてください。');
    return { ...profile, heightCm };
  }
  function preview() {
    setError('');
    try {
      const value = currentProfile();
      if (value) setPreviewUrl(modelPreviewUrl(value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '設定を確認してください。');
    }
  }
  /** @param {Record<string,any>} values */
  async function suggest(values) {
    if (busy) return;
    const name = String(values.name).trim();
    setError('');
    if (!name) {
      setError('AI設定の前に商品名を入力してください。');
      return;
    }
    const heightCm = height === '' ? null : Number(height);
    if (heightCm !== null && (!Number.isInteger(heightCm) || heightCm < 10 || heightCm > 1500)) {
      setError('庭オブジェクトの高さは10〜1500cmにしてください。');
      return;
    }
    const snapshot = { profile, enabled, height, estimated, previewUrl, warnings };
    setBusy(true);
    try {
      let imageUrl = null;
      let imageDataUrl = null;
      const source = String(values.imageUrl);
      if (includeImage) {
        if (source) {
          if (/^\/images\/[a-zA-Z0-9_.-]+$|^\/api\/product-images\/[a-f0-9-]{36}$/.test(source)) {
            const response = await fetch(source);
            if (!response.ok)
              throw new Error('商品写真を取得できません。写真なしに切り替えるかファイルを選択してください。');
            imageDataUrl = await dataUrl(await response.blob());
          } else if (source.startsWith('https://')) imageUrl = source;
          else if (source) throw new Error('商品写真を読み込めません。商品情報で画像を選び直してください。');
        }
      }
      const result = await api.suggestPlantModel({
        name,
        latinName: String(values.latinName),
        category: String(values.category),
        description: String(values.description),
        heightCm,
        currentProfile: profile,
        imageUrl,
        imageDataUrl,
      });
      setUndo(snapshot);
      setProfile(result.profile);
      setEnabled(true);
      setHeightValue(String(result.profile.heightCm));
      setEstimated(heightCm === null || estimated);
      setWarnings(result.warnings);
      setPreviewUrl(modelPreviewUrl(result.profile));
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI設定を取得できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  function restore() {
    if (!undo) return;
    setProfile(undo.profile);
    setEnabled(undo.enabled);
    setHeightValue(undo.height);
    setEstimated(undo.estimated);
    setPreviewUrl(undo.previewUrl);
    setWarnings(undo.warnings);
    setUndo(null);
    setError('');
    setRevision((value) => value + 1);
  }
  return {
    profile,
    currentProfile,
    enabled,
    setEnabled,
    height,
    setHeight,
    estimated,
    includeImage,
    setIncludeImage,
    busy,
    error,
    warnings,
    previewUrl,
    revision,
    undo,
    restore,
    suggest,
    preview,
    changeProfile,
  };
}
