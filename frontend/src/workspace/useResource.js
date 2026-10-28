import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../api';
/** @param {string|null} path */
export function useResource(path) {
  const [data, setData] = useState(/** @type {any} */ (null));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    if (!path) return;
    try {
      const value = await request(path);
      if (version === generation.current) {
        setData(value);
        setError('');
      }
    } catch (reason) {
      if (version === generation.current) setError(reason instanceof Error ? reason.message : '取得できませんでした。');
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);
  /** @param {()=>Promise<unknown>} action @param {string} [message] */
  async function run(action, message = '保存しました。') {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await reload();
      setNotice(message);
      return true;
    } catch (reason) {
      // The record changed or disappeared meanwhile (e.g. EC-S09/S10 4a): show the latest state with the error.
      if (reason instanceof ApiError && [404, 409].includes(reason.status)) await reload();
      setError(reason instanceof Error ? reason.message : '処理を完了できませんでした。');
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { data, error, notice, busy, reload, run };
}
/** @param {string} path @param {string} method @param {any} [body] */
export const write = (path, method, body) =>
  request(path, method, body === undefined ? undefined : JSON.stringify(body));
