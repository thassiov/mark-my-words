import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * Right-anchored slide-in side panel. Hand-rolled (instead of pulling
 * Radix Dialog) since we only need ESC/backdrop dismiss and a portal.
 *
 * Mounted via createPortal to document.body so the panel and its
 * backdrop sit above the rest of the app page layout regardless of
 * where the parent component tree is.
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  // Mount lifecycle: render only after a small async tick once `open`
  // flips, so the slide-in transition runs from off-screen-right.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame: flip `visible` so the transition runs.
      const id = requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => {
        cancelAnimationFrame(id);
      };
    }
    setVisible(false);
    // Keep mounted long enough for the slide-out transition to finish.
    const id = setTimeout(() => {
      setMounted(false);
    }, 220);
    return () => {
      clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 w-full transform bg-white shadow-2xl transition-transform duration-200 ease-out sm:w-[50vw] ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="absolute -left-5 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-xl text-stone-700 shadow-md transition-colors hover:bg-stone-50"
        >
          ×
        </button>
        {children}
      </aside>
    </div>,
    document.body,
  );
}
