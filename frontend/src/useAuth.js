import { useEffect, useState } from 'react';
import { readSession } from './auth';

export function useAuth() {
  const [session, setSession] = useState(/** @type {import('./auth').AuthSession|null} */ (null));
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    readSession().then((value) => { if (active) setSession(value); }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'ログイン状態を確認できません。');
    });
    return () => { active = false; };
  }, []);
  return { session, error };
}
