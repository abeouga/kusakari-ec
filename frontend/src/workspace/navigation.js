import { useEffect, useState } from 'react';

/** @param {string} path */
export function navigate(path) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname + window.location.hash);
  useEffect(() => {
    function changed() {
      setPath(window.location.pathname + window.location.hash);
    }
    window.addEventListener('popstate', changed);
    window.addEventListener('hashchange', changed);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener('hashchange', changed);
    };
  }, []);
  return path;
}
