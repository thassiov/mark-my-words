import { useEffect, useState } from 'preact/hooks';

import { DEFAULT_SETTINGS, type Settings } from '../shared/types.js';

import { SettingsService } from './settings-service.js';

/**
 * Module-scoped singleton — every consumer of `useSettings` shares the
 * same service / Dexie binding. Cheap; the table reference is ~1
 * object regardless of caller count.
 */
const service = new SettingsService();

interface UseSettings {
  /** Current settings, falling back to defaults until first load completes. */
  settings: Settings;
  /** True between mount and the first observation emission. */
  loading: boolean;
  /** Persist a partial patch. Resolves when the write hits Dexie. */
  update: (patch: Partial<Settings>) => Promise<void>;
}

/**
 * Live-updating settings hook for the options page. Wraps Dexie's
 * `liveQuery` — any write (from this tab or another) refreshes the
 * value automatically.
 */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = service.observe().subscribe({
      next: (next) => {
        setSettings(next);
        setLoading(false);
      },
      error: (err) => {
        console.error('[mark-my-words] settings observe failed:', err);
        setLoading(false);
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    settings,
    loading,
    update: async (patch) => {
      await service.update(patch);
    },
  };
}
