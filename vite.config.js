import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // ROADMAP.md's .env uses NEXT_PUBLIC_ prefixes (written for a Next.js-style
  // setup); Vite only exposes VITE_-prefixed vars to client code by default,
  // so widen envPrefix instead of renaming the documented variable names.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
