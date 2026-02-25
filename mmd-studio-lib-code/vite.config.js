import { defineConfig } from 'vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait()
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'MMDStudioLib',
      fileName: 'mmd-studio-lib',
      formats: ['es']
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});