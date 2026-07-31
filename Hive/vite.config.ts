import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hiveory/bee-voice': path.resolve(__dirname, '../BeeVoice/src'),
      '@hiveory/hiveextension': path.resolve(__dirname, '../HiveExtension/src'),
      '@hiveory/hivemind/core': path.resolve(__dirname, '../HiveMind/src/core.ts'),
      '@hiveory/hivemind/tauri': path.resolve(__dirname, '../HiveMind/src/tauri'),
      '@hiveory/hivemind': path.resolve(__dirname, '../HiveMind/src'),
      '@hiveory/honeyboard': path.resolve(__dirname, '../HoneyBoard/src'),
      '@hiveory/honeyflow': path.resolve(__dirname, '../HoneyFlow/src'),
      '@hiveory/nectar/tauri': path.resolve(__dirname, '../Nectar/src/tauri'),
      '@hiveory/nectar/ui': path.resolve(__dirname, '../Nectar/src/ui'),
      '@hiveory/nectar': path.resolve(__dirname, '../Nectar/src'),
      '@hiveory/nectar-mcp': path.resolve(__dirname, '../Nectar/nectar-mcp/src'),
      '@hiveory/plugins': path.resolve(__dirname, '../HivePlugins/src'),
      '@hiveory/queenbee': path.resolve(__dirname, '../QueenBee/src'),
      '@hiveory/taskcomb': path.resolve(__dirname, '../TaskComb/src'),
      '@hiveory/worker-bees/storage': path.resolve(__dirname, '../WorkerBees/src/ui/persistStorage.ts'),
      '@hiveory/worker-bees/cli-configs': path.resolve(__dirname, '../WorkerBees/src/cli-configs'),
      '@hiveory/worker-bees/ui': path.resolve(__dirname, '../WorkerBees/src/ui'),
      '@hiveory/worker-bees': path.resolve(__dirname, '../WorkerBees/src'),
      '@hiveory/workhive/ui': path.resolve(__dirname, '../WorkHive/src/ui'),
      '@hiveory/workhive': path.resolve(__dirname, '../WorkHive/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/dist/**',
        '**/.nectar/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/*.tsbuildinfo',
        '**/agents/**',
        '**/memory/**',
        '**/sessions/**',
      ],
    },
  },
});
