import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  define: {
    'process.env': {},
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
  server: {
    port: 5180,
    strictPort: true,
  },
})
