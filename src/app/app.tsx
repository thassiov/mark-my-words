import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { useSettings } from '../settings/use-settings.js';

import { LibrarySection } from './components/library-section.js';
import { SettingsSection } from './components/settings/settings-section.js';

type Section = 'library' | 'archived' | 'settings';

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'archived', label: 'Archived' },
  { id: 'settings', label: 'Settings' },
];

function App() {
  const [section, setSection] = useState<Section>('library');
  const { settings } = useSettings();

  // Apply the theme as a data attribute on <html>. Actual dark-mode
  // styling is deferred to MARK-38 — this just ensures the choice is
  // observable in the DOM and survives reloads.
  useEffect(() => {
    const html = document.documentElement;
    if (settings.theme === 'auto') {
      delete html.dataset['theme'];
    } else {
      html.dataset['theme'] = settings.theme;
    }
  }, [settings.theme]);

  let view: ComponentChildren;
  if (section === 'library') {
    view = <LibrarySection key="library" archived={false} />;
  } else if (section === 'archived') {
    view = <LibrarySection key="archived" archived={true} />;
  } else {
    view = <SettingsSection />;
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <nav className="flex w-52 flex-shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <h1 className="mb-8 text-base font-semibold tracking-tight text-gray-900">mark-my-words</h1>
        <ul className="space-y-1">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  setSection(id);
                }}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  section === id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">{view}</div>
    </div>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
