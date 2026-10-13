import { useState } from 'react';
import { createDemoState } from './demoData';

export function useDemo() {
  const [state, setState] = useState(createDemoState);
  const [notice, setNotice] = useState('');
  /** @param {(draft:import('./demoData').DemoState)=>void} change @param {string} message */
  function update(change, message) {
    setState((current) => {
      const draft = structuredClone(current);
      change(draft);
      return draft;
    });
    setNotice(message);
  }
  return { state, update, notice, setNotice };
}

/** @typedef {ReturnType<typeof useDemo>} Demo */
