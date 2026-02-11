import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
    sourcemap: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020',
    },
  },
})
