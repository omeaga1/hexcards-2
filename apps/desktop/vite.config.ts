import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port and must see Rust errors in the terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Browser preview only: player lookups go to OP.GG through here (the desktop app calls it from Rust).
    proxy: { '/opgg': { target: 'https://mcp-api.op.gg', changeOrigin: true, rewrite: (path) => path.replace(/^\/opgg/, '') } },
  },
});
