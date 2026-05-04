import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showToastInPage } from './show-toast.js';

describe('showToastInPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.querySelectorAll('#mmw-toast').forEach((el) => {
      el.remove();
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.querySelectorAll('#mmw-toast').forEach((el) => {
      el.remove();
    });
  });

  it('inserts a toast element with the given message', () => {
    showToastInPage('success', 'Snippet saved', 1000);
    const el = document.getElementById('mmw-toast');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe('Snippet saved');
    expect(el?.getAttribute('role')).toBe('status');
  });

  it.each([
    ['success', 'rgb(22, 163, 74)'],
    ['info', 'rgb(82, 82, 82)'],
    ['error', 'rgb(185, 28, 28)'],
  ] as const)('uses the %s color', (variant, expectedBg) => {
    showToastInPage(variant, 'hello', 1000);
    const el = document.getElementById('mmw-toast') as HTMLElement;
    expect(el.style.background).toContain(variant === 'success' ? '#16a34a' : variant === 'info' ? '#525252' : '#b91c1c');
    expect(expectedBg).toMatch(/^rgb\(/);
  });

  it('replaces an existing toast instead of stacking', () => {
    showToastInPage('info', 'first', 1000);
    showToastInPage('success', 'second', 1000);
    const all = document.querySelectorAll('#mmw-toast');
    expect(all.length).toBe(1);
    expect(all[0]?.textContent).toBe('second');
  });

  it('removes the toast after the given visibleMs + 200ms fade', () => {
    showToastInPage('success', 'gone soon', 3800);
    expect(document.getElementById('mmw-toast')).not.toBeNull();
    vi.advanceTimersByTime(3800);
    expect(document.getElementById('mmw-toast')).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(document.getElementById('mmw-toast')).toBeNull();
  });

  it('honours a different visibleMs', () => {
    showToastInPage('info', 'short', 500);
    vi.advanceTimersByTime(500);
    expect(document.getElementById('mmw-toast')).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(document.getElementById('mmw-toast')).toBeNull();
  });

  it('attaches to documentElement so it survives body re-renders', () => {
    showToastInPage('info', 'top-level', 1000);
    const el = document.getElementById('mmw-toast');
    expect(el?.parentElement).toBe(document.documentElement);
  });
});
