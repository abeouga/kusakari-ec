import { useEffect, useRef, useState } from 'react';
import { firstInvalid } from '../formValidity';
import { modelPreviewUrl } from '../plantModel';

/** Wait for the input to settle so dragging a slider does not reload the preview for every value (issue #51). */
export const PREVIEW_DELAY_MS = 400;
/**
 * Canvas renders the preview from its URL only, so a new value needs a new document. The new frame stays transparent
 * on top of the previous one until it has loaded and had a moment to resolve the model, which avoids a blank flash.
 * 700ms is an estimate: Canvas is another origin and does not report when it has drawn the model, so a slower draw
 * can still show a short flash.
 */
const SWAP_AFTER_LOAD_MS = 700;

/**
 * Automatic plant preview. The previous preview stays while any garden input is invalid; those inputs show their
 * own error message.
 * @param {ReturnType<import('./usePlantSuggestion').usePlantSuggestion>} plant
 * @param {import('react').RefObject<HTMLElement|null>} fields the garden inputs, checked with the same constraints
 *   as the form submission
 * @param {boolean} active the step is shown; a hidden step does not load Canvas
 */
export function usePlantPreview(plant, fields, active) {
  const [shown, setShown] = useState('');
  const [next, setNext] = useState('');
  const [stale, setStale] = useState(false);
  // Typing an unusable value leaves the profile as it is (RangeField validOnly), so input events also start a check.
  const [edits, setEdits] = useState(0);
  const latest = useRef('');
  const { profile, height, configured } = plant;
  useEffect(() => {
    latest.current = next;
  }, [next]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => {
      if (!configured) {
        setStale(false);
        setNext('');
        return;
      }
      // A missing plant height must not hide the model while the seller is choosing its shape. Render an approximate
      // preview at the profile's default height, but keep the field required for advancing/saving the product.
      const invalid = firstInvalid(fields.current, height === '' ? ['modelHeight'] : []);
      if (invalid) {
        setStale(!!invalid);
        return;
      }
      setStale(false);
      const previewHeight = height === '' ? profile.heightCm : Number(height);
      setNext(modelPreviewUrl({ ...profile, heightCm: previewHeight }));
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [profile, height, configured, fields, active, edits]);

  const pending = next && next !== shown ? next : '';
  /** @param {string} url the frame that finished loading */
  function loaded(url) {
    window.setTimeout(() => {
      if (latest.current === url) setShown(url);
    }, SWAP_AFTER_LOAD_MS);
  }
  return {
    shown: configured ? shown : '',
    pending: configured ? pending : '',
    stale,
    approximateHeight: configured && height === '' ? profile.heightCm : null,
    loaded,
    edited: () => setEdits((count) => count + 1),
  };
}
