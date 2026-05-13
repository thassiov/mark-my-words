import { useSettings } from '../../../settings/use-settings.js';
import type { Theme } from '../../../shared/types.js';

import { DataCard } from './data-card.js';
import { SettingRow, SettingsCard, Toggle } from './settings-primitives.js';
import { TagsCard } from './tags-card.js';

export function SettingsSection() {
  const { settings, loading, update } = useSettings();

  return (
    <div className="h-full overflow-auto px-6 py-8">
      <header className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-stone-100">
          Settings
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-stone-400">
          Extension behavior and preferences.
        </p>
      </header>

      <div className="max-w-2xl space-y-4">
        <SettingsCard title="Appearance">
          <SettingRow label="Theme" description="Light, dark, or follow the system preference.">
            <select
              value={settings.theme}
              disabled={loading}
              onChange={(e) => {
                void update({ theme: (e.target as HTMLSelectElement).value as Theme });
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Capture">
          <SettingRow
            label="Capture page screenshot"
            description="Save a JPEG snapshot of the page at save time."
          >
            <Toggle
              checked={settings.captureScreenshot}
              disabled={loading}
              onChange={(v) => {
                void update({ captureScreenshot: v });
              }}
            />
          </SettingRow>
          <SettingRow
            label="Strip tracking parameters"
            description={'Remove utm_*, fbclid, gclid, mc_eid, ref, source from the saved URL.'}
          >
            <Toggle
              checked={settings.stripTrackingParams}
              disabled={loading}
              onChange={(v) => {
                void update({ stripTrackingParams: v });
              }}
            />
          </SettingRow>
          <SettingRow
            label="Max selection length"
            description="Selections longer than this are rejected with a toast."
          >
            <input
              type="number"
              min={500}
              max={20_000}
              step={500}
              value={settings.maxSelectionChars}
              disabled={loading}
              onChange={(e) => {
                const raw = (e.target as HTMLInputElement).valueAsNumber;
                if (!Number.isFinite(raw) || raw < 500) return;
                void update({
                  maxSelectionChars: Math.min(20_000, Math.max(500, Math.trunc(raw))),
                });
              }}
              className="w-28 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
            />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Save toast">
          <SettingRow
            label="Auto-dismiss duration"
            description="How long the post-save pill stays before it fades away."
          >
            <select
              value={String(settings.toastDurationMs)}
              disabled={loading}
              onChange={(e) => {
                void update({
                  toastDurationMs: Number((e.target as HTMLSelectElement).value),
                });
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="3000">3 seconds</option>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds</option>
              <option value="0">Never</option>
            </select>
          </SettingRow>
        </SettingsCard>

        <TagsCard />

        <DataCard />

        <SettingsCard title="Keyboard shortcut">
          <div className="flex flex-wrap items-center gap-2">
            <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
              Ctrl+Shift+S
            </kbd>
            <span className="text-xs text-gray-400 dark:text-stone-500">Mac: ⌘⇧S</span>
            <span className="text-xs text-gray-400 dark:text-stone-500">·</span>
            <a
              href="chrome://extensions/shortcuts"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Change in chrome://extensions/shortcuts
            </a>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
