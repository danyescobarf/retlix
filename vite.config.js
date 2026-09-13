import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 47'],
      renderLegacyChunks: true,
      modernPolyfills: true,
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  server: {
    host: true, // listen on 0.0.0.0 so phones on the same Wi-Fi can connect (prints the Network URL)
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000', // the proxy runs on this machine, so localhost is fine
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    cssTarget: 'chrome56',
    // Tizen app loads from file:// — paths must be relative
    assetsDir: 'assets',
  },
});
