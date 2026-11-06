/**
 * The first input the seller has to fix. Inputs inside a hidden group (the flower inputs while flowers are off, a
 * control the plant type does not use) are skipped: they keep their last usable value in the profile and cannot be
 * focused. Hidden wizard steps (`data-step`) are still checked, because the form reveals that step.
 * @param {Element|null|undefined} root
 * @returns {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null}
 */
export function firstInvalid(root) {
  if (!root) return null;
  for (const element of root.querySelectorAll('input:invalid,select:invalid,textarea:invalid')) {
    const hidden = element.closest('[hidden]');
    if (!hidden || hidden.hasAttribute('data-step'))
      return /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (element);
  }
  return null;
}
