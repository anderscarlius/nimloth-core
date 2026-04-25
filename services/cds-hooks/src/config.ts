export interface CdsConfig {
  port: number;
  fhirBaseUrl: string;
  logLevel: string;
}

export function loadConfig(): CdsConfig {
  return {
    port: Number(process.env.CDS_HOOKS_PORT ?? process.env.PORT ?? 3004),
    fhirBaseUrl: process.env.FHIR_BASE_URL ?? 'http://fhir-facade:3003/fhir/r4',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
