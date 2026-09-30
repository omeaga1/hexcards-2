import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Arc components import through "@/", which points at this app's root.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  // Tauri expects a fixed port and must see Rust errors in the terminal.
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
