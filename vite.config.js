import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite configuration — Tailwind v4 runs as a Vite plugin (no postcss.config needed)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
