// In-memory cache patient_id → personnummer per source_system.
// Populeras från patients-CDC-events. Används av alla mappers för att
// ersätta numeriskt patient_id med personnummer i patient_id-fältet på
// utgående BaseEvent.

type SourceSystem = 'melior' | 'asynja';

export class PatientCache {
  private readonly cache = new Map<string, string>();

  private key(source: SourceSystem, id: number | string): string {
    return `${source}:${id}`;
  }

  upsert(source: SourceSystem, patientId: number | string, personnummer: string): void {
    if (!personnummer) return;
    this.cache.set(this.key(source, patientId), personnummer);
  }

  get(source: SourceSystem, patientId: number | string | null | undefined): string | null {
    if (patientId == null) return null;
    return this.cache.get(this.key(source, patientId)) ?? null;
  }

  size(): number {
    return this.cache.size;
  }
}
