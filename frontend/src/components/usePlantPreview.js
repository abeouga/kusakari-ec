import { useEffect, useRef, useState } from 'react';
import { modelPreviewUrl } from '../plantModel';

/** Wait for the input to settle so dragging a slider does not reload the preview for every value (issue #51). */
export const PREVIEW_DELAY_MS = 400;
/**
 * Canvas renders the preview from its URL only, so a new value needs a new document. The new frame stays transparent
 * on top of the previous one until it has loaded and had a moment to resolve the model, which avoids a blank flash.
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
      const invalid = fields.current?.querySelector('input:invalid,select:invalid');
      if (invalid || height === '') {
        setStale(!!invalid);
        return;
      }
      setStale(false);
      setNext(modelPreviewUrl({ ...profile, heightCm: Number(height) }));
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [profile, height, configured, fields, active]);

  const pending = next && next !== shown ? next : '';
  /** @param {string} url the frame that finished loading */
  function loaded(url) {
    window.setTimeout(() => {
      if (latest.current === url) setShown(url);
    }, SWAP_AFTER_LOAD_MS);
  }
  return { shown: configured ? shown : '', pending: configured ? pending : '', stale, loaded };
}
