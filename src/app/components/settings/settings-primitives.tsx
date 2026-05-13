import type { ComponentChildren } from 'preact';

interface SettingsCardProps {
  title: string;
  children: ComponentChildren;
}

/** Container for a group of settings rows under a labelled section. */
export function SettingsCard({ title, children }: SettingsCardProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: ComponentChildren;
}

/** One row within a SettingsCard: label + optional description on the left, control on the right. */
export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-gray-500">{description}</div> : null}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

/** Switch-style toggle (role="switch", `aria-checked`). */
export function Toggle({ checked, disabled, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-stone-900' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
