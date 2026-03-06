import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'es2020',
    sourcemap: mode !== 'production',
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    rollupOptions: {},
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020',
    },
  },
  server: {
    hmr: {
      overlay: true,
    },
  },
}))
