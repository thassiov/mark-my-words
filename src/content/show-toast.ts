export type ToastVariant = 'success' | 'info' | 'error';

/**
 * Show a small overlay toast in the top-right of the page for ~2s.
 *
 * **No module imports.** Shipped to the page context via
 * `chrome.scripting.executeScript({ func: showToastInPage, args: [...] })`.
 * Anything it references at runtime must be available in that context
 * (DOM globals are fine; closures over module-scope vars are not).
 *
 * Reuses a single fixed-id element so consecutive saves replace the
 * previous toast instead of stacking.
 */
export function showToastInPage(variant: 'success' | 'info' | 'error', message: string): void {
  const ID = 'mmw-toast';
  const existing = document.getElementById(ID);
  if (existing !== null) existing.remove();

  const colors = {
    success: { bg: '#16a34a', fg: '#fff' },
    info: { bg: '#525252', fg: '#fff' },
    error: { bg: '#b91c1c', fg: '#fff' },
  };
  const c = colors[variant];

  const el = document.createElement('div');
  el.id = ID;
  el.textContent = message;
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
    padding: '8px 14px',
    background: c.bg,
    color: c.fg,
    borderRadius: '6px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    opacity: '0',
    transform: 'translateY(-8px)',
    transition: 'opacity 150ms ease, transform 150ms ease',
    pointerEvents: 'none',
  });

  document.documentElement.appendChild(el);
  // Force reflow so the transition runs.
  void el.offsetHeight;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      el.remove();
    }, 200);
  }, 3800);
}
