// Sandlådekatalogen — de 6 ankarpersonerna från SDG-09/10. Stänger Fas 1:s
// öppna namnregister-fråga: detta ÄR demo-rostern i praktiken.

export interface AnchorPatient {
  patientId: string;
  displayName: string;
  age: number;
  label: string;
  /** Förväntad HbA1c-story — guidar demo-narrativet, inte logik. */
  expectation: string;
}

export const DEMO_ROSTER: AnchorPatient[] = [
  {
    patientId: 'marianne-lindqvist-syn-001',
    displayName: 'Marianne Lindqvist',
    age: 81,
    label: 'Äldre multisjuk — polyfarmaci',
    expectation: 'Flera analyter, lång journal.',
  },
  {
    patientId: 'ingrid-andersson-syn-001',
    displayName: 'Ingrid Andersson',
    age: 74,
    label: 'Sprint 2 huvudscenario — höftprotes + DVT',
    expectation: 'HbA1c stabil (välbehandlad T2D).',
  },
  {
    patientId: 'anders-bergstrom-syn-001',
    displayName: 'Anders Bergström',
    age: 58,
    label: 'Dropout — diabetes utan uppföljning',
    expectation: 'En HbA1c, sedan tyst — tom trend efter diagnos.',
  },
  {
    patientId: 'karin-eriksson-syn-001',
    displayName: 'Karin Eriksson',
    age: 72,
    label: 'Frekvent återbesökare — recidiverande UVI',
    expectation: 'Ingen HbA1c (ej diabetes) — tomt tillstånd.',
  },
  {
    patientId: 'lars-johansson-syn-001',
    displayName: 'Lars Johansson',
    age: 63,
    label: 'Responder — HbA1c sjunker efter insättning',
    expectation: 'Linjen FALLER (82 → 58).',
  },
  {
    patientId: 'eva-lindgren-syn-001',
    displayName: 'Eva Lindgren',
    age: 67,
    label: 'Non-responder — HbA1c stiger trots behandling',
    expectation: 'Linjen STIGER.',
  },
];
