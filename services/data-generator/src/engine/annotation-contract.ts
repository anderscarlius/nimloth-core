// PATCH B (Fas 1 Obs 3) — annotation-kontrakt enforced vid genereringstid.
//
// SDG-composers parsar `TYPE | CODE | DESCRIPTION` för att fylla strukturerade
// fält i domän-OPTs (analyte_name, atc_code, diagnosis_code). En fri-form-
// annotation som inte matchar kontraktet skulle tyst degradera till skräp i
// kod-fältet (eller, värre, en 422 vid composition-POST). Vi failar LOUD här
// istället — en generator-bugg som producerar en trasig annotation stoppar
// genereringen direkt, inte vid EHRbase-load eller AQL-tid.
//
// Kontrakt: tre pipe-avgränsade segment.
//   TYPE  — identifierare (event-typ, lowercase_snake i praktiken)
//   CODE  — identifierare (klinisk kod / profil-tag, alfanumerisk + _)
//   DESC  — fri text (minst ett tecken)
//
// Determinism (S1): ren guard. Alla nuvarande annotations matchar → ingen
// throw → inget beteende ändras. Endast en framtida malformation triggar.

export const ANNOTATION_CONTRACT = /^[A-Za-z_]+ \| [A-Za-z0-9_]+ \| .+$/;

export class AnnotationContractError extends Error {
  constructor(public readonly annotation: string, public readonly eventType?: string) {
    super(
      `Annotation bryter TYPE | CODE | DESC-kontraktet${eventType ? ` (event=${eventType})` : ""}: ${JSON.stringify(annotation)}`,
    );
    this.name = "AnnotationContractError";
  }
}

/** Throws AnnotationContractError if the annotation is malformed; returns it
 *  unchanged otherwise (so it composes inline: `annotation: assertAnnotation(...)`). */
export function assertAnnotation(annotation: string, eventType?: string): string {
  if (!ANNOTATION_CONTRACT.test(annotation)) {
    throw new AnnotationContractError(annotation, eventType);
  }
  return annotation;
}
