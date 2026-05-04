// MV3 service worker — no-op v0 boot. Real handlers come in MARK-3+.

import pkg from '../../package.json' with { type: 'json' };

console.log(`[mark-my-words] service worker booted (version ${pkg.version})`);
