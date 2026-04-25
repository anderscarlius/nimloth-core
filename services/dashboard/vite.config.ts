import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxar API-anrop till bakomliggande tjänster så browsern slipper CORS.
// Värdarna är tillgängliga inuti docker-nätverket; utanför fallback till localhost.
const FHIR = process.env.FHIR_BASE_URL ?? 'http://fhir-facade:3003';
const CDS = process.env.CDS_BASE_URL ?? 'http://cds-hooks:3004';
const AUDIT = process.env.AUDIT_BASE_URL ?? 'http://audit:3005';
const REPLICATION = process.env.REPLICATION_BASE_URL ?? 'http://replication:3007';
const EDGE_FHIR = process.env.EDGE_FHIR_BASE_URL ?? 'http://edge-su:3003';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api/fhir': { target: FHIR, changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/fhir/, '/fhir/r4') },
      '/api/cds': { target: CDS, changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/cds/, '') },
      '/api/audit': { target: AUDIT, changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/audit/, '/audit') },
      '/api/topology': {
        target: REPLICATION,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/topology/, '/topology'),
      },
      '/api/edge-fhir': {
        target: EDGE_FHIR,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/edge-fhir/, '/fhir/r4'),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
