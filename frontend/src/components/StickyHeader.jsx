import { useLayoutEffect, useRef } from 'react';
import '../css/sticky-header.css';

/**
 * Issue #31: keeps the shared header (and the session notice under it) on screen while the page scrolls,
 * so the cart and account links stay one click away. The announcement band scrolls away.
 * The stuck height changes with the header's wrapping, so it is published as --ec-header-offset for
 * anchors and other sticky panels that must sit below it.
 * className adds a state to the wrapper, such as hiding the cart for accounts that cannot buy (issue #108).
 * @param {{children:import('react').ReactNode, className?:string}} props
 */
export function StickyHeader({ children, className = '' }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () => {
      const band = /** @type {HTMLElement|null} */ (element.querySelector('.announcement'));
      const hidden = band?.offsetHeight ?? 0;
      element.style.top = `-${hidden}px`;
      root.style.setProperty('--ec-header-offset', `${element.offsetHeight - hidden}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--ec-header-offset');
    };
  }, []);
  return (
    <div className={`ec-sticky-header${className ? ` ${className}` : ''}`} ref={ref}>
      {children}
    </div>
  );
}
