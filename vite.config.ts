import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

import { manifest } from './src/manifest';

export default defineConfig({
  plugins: [preact(), tailwindcss(), crx({ manifest })],
  resolve: {
    // Alias React imports to preact/compat so React-targeted libraries
    // (e.g. shadcn/ui, lucide-react) work without shipping the full
    // React bundle. @preact/preset-vite usually handles this; explicit
    // here as belt-and-suspenders.
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
