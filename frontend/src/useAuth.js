import { useEffect, useState } from 'react';
import { readSession } from './auth';

export function useAuth() {
  const [session, setSession] = useState(/** @type {import('./auth').AuthSession|null} */ (null));
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    function refreshSession() { readSession().then((value) => { if (active) { setSession(value); setError(''); } }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'ログイン状態を確認できません。');
    }); }
    refreshSession();
    window.addEventListener('kusakari-auth-changed', refreshSession);
    return () => { active = false; window.removeEventListener('kusakari-auth-changed', refreshSession); };
  }, []);
  return { session, error };
}
