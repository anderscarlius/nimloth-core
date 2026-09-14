import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { smedjanApiPlugin } from './vite.smedjan-plugin';

export default defineConfig({
  plugins: [react(), smedjanApiPlugin()],
  server: {
    port: 3019,
    host: '127.0.0.1', // bara lokalt — inget auth-skydd, ska aldrig exponeras på LAN/WAN
  },
});
