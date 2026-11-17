import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // Rendu serveur (build:ssr) : tout est embarqué dans un seul fichier, pour
  // que l'image de production n'ait pas besoin des node_modules du client.
  ssr: { noExternal: true },
  build: { copyPublicDir: !isSsrBuild },
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
}))
