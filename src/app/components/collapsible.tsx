import type { ComponentChildren } from 'preact';

interface CollapsibleProps {
  label: string;
  children: ComponentChildren;
}

/**
 * Native `<details>` with shadcn-flavored chrome. Default closed; the
 * chevron rotates on open. No JS state — the browser handles it.
 */
export function Collapsible({ label, children }: CollapsibleProps) {
  return (
    <details className="group rounded-lg bg-white px-4 py-3 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-700/70">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
        <span>{label}</span>
        <span
          aria-hidden="true"
          className="text-stone-400 transition-transform group-open:rotate-90 dark:text-stone-500"
        >
          ›
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
