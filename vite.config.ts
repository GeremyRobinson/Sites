import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SINGLE=1 builds one JS file, for bundling Sites into a single HTML page.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { rollupOptions: { output: { inlineDynamicImports: !!globalThis.process?.env.SINGLE } } },
})
