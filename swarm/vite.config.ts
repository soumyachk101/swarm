import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@swarm/voice': path.resolve(__dirname, '../Voice/src'),
      '@swarm/extension': path.resolve(__dirname, '../SwarmExtension/src'),
      '@swarm/mind/core': path.resolve(__dirname, '../SwarmMind/src/core.ts'),
      '@swarm/mind/tauri': path.resolve(__dirname, '../SwarmMind/src/tauri'),
      '@swarm/mind': path.resolve(__dirname, '../SwarmMind/src'),
      '@swarm/board': path.resolve(__dirname, '../Board/src'),
      '@swarm/flow': path.resolve(__dirname, '../Flow/src'),
      '@swarm/pheromone/tauri': path.resolve(__dirname, '../Pheromone/src/tauri'),
      '@swarm/pheromone/ui': path.resolve(__dirname, '../Pheromone/src/ui'),
      '@swarm/pheromone': path.resolve(__dirname, '../Pheromone/src'),
      '@swarm/pheromone-mcp': path.resolve(__dirname, '../Pheromone/pheromone-mcp/src'),
      '@swarm/plugins': path.resolve(__dirname, '../SwarmPlugins/src'),
      '@swarm/lead': path.resolve(__dirname, '../Lead/src'),
      '@swarm/tasks': path.resolve(__dirname, '../Tasks/src'),
      '@swarm/agents/storage': path.resolve(__dirname, '../Agents/src/ui/persistStorage.ts'),
      '@swarm/agents/cli-configs': path.resolve(__dirname, '../Agents/src/cli-configs'),
      '@swarm/agents/ui': path.resolve(__dirname, '../Agents/src/ui'),
      '@swarm/agents': path.resolve(__dirname, '../Agents/src'),
      '@swarm/workspace/ui': path.resolve(__dirname, '../Workspace/src/ui'),
      '@swarm/workspace': path.resolve(__dirname, '../Workspace/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/dist/**',
        '**/.pheromone/**',
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
