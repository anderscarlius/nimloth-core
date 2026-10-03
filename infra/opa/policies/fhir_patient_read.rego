# WP-IN3 — kritisk path: GET FHIR Patient (dataklass 0).
# Runtime i fhir-facade speglas av @nimloth-core/pdl-policy evaluateFhirPatientRead.
package nimloth.fhir_patient_read

import future.keywords.if
import future.keywords.in

default allow := false

allow if {
	input.emergency
	trim_space(input.emergency_justification) != ""
}

allow if {
	input.has_care_relation
	not input.blocked
	input.purpose != "RESEARCH"
}

allow if {
	input.has_care_relation
	not input.blocked
	input.purpose == "RESEARCH"
	input.research_consent
}

deny_reason[msg] if {
	input.emergency
	trim_space(input.emergency_justification) == ""
	msg := "EMERGENCY_JUSTIFICATION_REQUIRED"
}

deny_reason[msg] if {
	not input.emergency
	not input.has_care_relation
	msg := "NO_CARE_RELATION"
}

deny_reason[msg] if {
	not input.emergency
	input.blocked
	msg := "PATIENT_BLOCKED"
}

deny_reason[msg] if {
	not input.emergency
	input.has_care_relation
	not input.blocked
	input.purpose == "RESEARCH"
	not input.research_consent
	msg := "RESEARCH_CONSENT_DENIED"
}
