import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'treat-js-files-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (id.includes('node_modules')) return null;
        if (!id.endsWith('.js')) return null;
        return transformWithOxc(code, id, {
          lang: 'jsx',
        });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/web-shims/async-storage.js'),
      'expo-location': path.resolve(__dirname, 'src/web-shims/expo-location.js'),
      'expo-notifications': path.resolve(__dirname, 'src/web-shims/expo-notifications.js'),
      'expo-device': path.resolve(__dirname, 'src/web-shims/expo-device.js'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://manormart-pay.vercel.app',
        changeOrigin: true,
        headers: {
          Origin: 'https://shabaj9769-alt.github.io',
        },
      },
    },
  },
});
