import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxar API-anrop till bakomliggande tjänster så browsern slipper CORS.
// Värdarna är tillgängliga inuti docker-nätverket; utanför fallback till localhost.
const FHIR = process.env.FHIR_BASE_URL ?? 'http://fhir-facade:3003';
const CDS = process.env.CDS_BASE_URL ?? 'http://cds-hooks:3004';
const AUDIT = process.env.AUDIT_BASE_URL ?? 'http://audit:3005';
const REPLICATION = process.env.REPLICATION_BASE_URL ?? 'http://replication:3007';
const EDGE_FHIR = process.env.EDGE_FHIR_BASE_URL ?? 'http://edge-su:3003';
const TERMINOLOGY = process.env.TERMINOLOGY_BASE_URL ?? 'http://terminology:3008';
const MAPPING_ASSISTANT = process.env.MAPPING_ASSISTANT_BASE_URL ?? 'http://mapping-assistant:3009';

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
      '/api/terminology': {
        target: TERMINOLOGY,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/terminology/, ''),
      },
      '/api/mappings': {
        target: MAPPING_ASSISTANT,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mappings/, ''),
      },
      // Path Y: /facade/parity/* är system-internal på fhir-facade-sidan
      // (utanför auth/audit/pdl-mw-kedjan). PDL-headers från jsonFetch
      // ignoreras. Dashboard-triggad mätning loggas i parity_snapshots
      // som trigger='manual' utan användar-attribution.
      '/api/parity': {
        target: FHIR,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/parity/, '/facade/parity'),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
