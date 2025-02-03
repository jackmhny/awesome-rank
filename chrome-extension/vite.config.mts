import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import libAssetsPlugin from '@laynezh/vite-plugin-lib-assets';
import makeManifestPlugin from './utils/plugins/make-manifest-plugin';
import { watchPublicPlugin, watchRebuildPlugin } from '@extension/hmr';
import { isDev, isProduction, watchOption } from '@extension/vite-config';
import react from '@vitejs/plugin-react';

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, 'src');
const outDir = resolve(rootDir, '..', 'dist');

// Get the target from the command line argument
const target = process.env.BUILD_TARGET || 'background';

const config = {
  background: {
    entry: resolve(__dirname, 'src/background/index.ts'),
    fileName: 'background.iife.js',
    name: 'background',
  },
  content: {
    entry: resolve(__dirname, 'src/content/index.ts'),
    fileName: 'content/index.iife.js',
    name: 'content',
  },
}[target];

if (!config) {
  throw new Error(`Invalid build target: ${target}`);
}

export default defineConfig({
  resolve: {
    alias: {
      '@root': rootDir,
      '@src': srcDir,
      '@assets': resolve(srcDir, 'assets'),
    },
  },
  plugins: [
    react(),
    libAssetsPlugin({
      outputPath: outDir,
    }) as PluginOption,
    watchPublicPlugin(),
    makeManifestPlugin({ outDir }),
    isDev && watchRebuildPlugin({ reload: true, id: 'chrome-extension-hmr' }),
  ],
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: isDev,
    minify: isProduction,
    reportCompressedSize: isProduction,
    watch: watchOption,
    rollupOptions: {
      input: config.entry,
      output: {
        entryFileNames: config.fileName,
        format: 'iife',
        extend: true,
      },
      external: ['chrome'],
    },
  },
  envDir: '../',
});
