// Minimal hand-written FSH for MF3 SUSHI CI (no MF2/OPT coupling in v1).

Alias: Patient = http://hl7.org/fhir/StructureDefinition/Patient

Profile: NimlothStubPatient
Parent: Patient
Id: nimloth-stub-patient
Title: "Nimloth stub patient profile"
Description: "Minimal stub profile proving SUSHI generates StructureDefinition in CI."
* name 1..1
