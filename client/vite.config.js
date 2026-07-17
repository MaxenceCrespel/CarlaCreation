import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API + uploaded photos to the NestJS backend during dev so the
      // frontend can call relative paths like /api/services — same pattern
      // production uses (Nest serves the built frontend + API on one origin).
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
})
