import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@app/api': resolve(__dirname, '../../packages/api/src'),
        '@app/domain': resolve(__dirname, '../../packages/domain/src'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@app/api': resolve(__dirname, '../../packages/api/src'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@app/api': resolve(__dirname, '../../packages/api/src'),
        '@app/domain': resolve(__dirname, '../../packages/domain/src'),
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
  },
});
