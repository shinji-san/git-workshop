import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

/**
 * electron-vite bundles the three worlds separately:
 *  - main:    Node main process (composition root, PTY, watcher, IPC)
 *  - preload: thin contextBridge
 *  - renderer: two HTML entry points (console + graph)
 */
export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, 'src/electron/main/main.ts') },
      rollupOptions: { external: ['node-pty', 'chokidar'] },
    },
  },
  preload: {
    // CommonJS preload so it runs with the safe default sandbox:true
    // (an ESM preload would force sandbox:false). electron-vite writes the
    // CJS output as preload.cjs -> referenced accordingly in main.ts.
    build: {
      lib: {
        entry: resolve(__dirname, 'src/electron/preload/preload.ts'),
        formats: ['cjs'],
      },
    },
  },
  renderer: {
    root: 'src/electron',
    build: {
      rollupOptions: {
        input: {
          'renderer-console': resolve(__dirname, 'src/electron/renderer-console/index.html'),
          'renderer-graph': resolve(__dirname, 'src/electron/renderer-graph/index.html'),
        },
      },
    },
  },
});
