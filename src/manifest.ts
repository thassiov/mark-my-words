import type { ManifestV3Export } from '@crxjs/vite-plugin';

import pkg from '../package.json' with { type: 'json' };

export const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'mark-my-words',
  version: pkg.version || '0.0.0',
  description: pkg.description,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    },
  },
  permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
  options_ui: {
    page: 'src/options/options.html',
    open_in_tab: true,
  },
  commands: {
    'save-snippet': {
      suggested_key: {
        default: 'Ctrl+Shift+S',
        mac: 'Command+Shift+S',
      },
      description: 'Save the selected text as a snippet',
    },
  },
};
