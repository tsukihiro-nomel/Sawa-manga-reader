// Dedicated Vite entry for the installer UI. Builds to installer/dist-ui
// which is then bundled into the Electron `installer-ui.exe` wrapper.
//
// Run with: vite -c vite.installer.config.js  (dev)
//           vite build -c vite.installer.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'installer/ui'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, 'installer/dist-ui'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome120',
    rollupOptions: {
      input: path.join(__dirname, 'installer/ui/index.html'),
    },
  },
  server: {
    port: 5183,
    strictPort: true,
  },
});
