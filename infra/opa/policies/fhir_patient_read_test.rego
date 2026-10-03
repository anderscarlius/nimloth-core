package nimloth.fhir_patient_read_test

import rego.v1

import data.nimloth.fhir_patient_read

test_care_permit if {
	fhir_patient_read.allow with input as {
		"has_care_relation": true,
		"emergency": false,
		"emergency_justification": "",
		"blocked": false,
		"purpose": "CARE",
		"research_consent": false,
	}
}

test_emergency_requires_justification if {
	not fhir_patient_read.allow with input as {
		"has_care_relation": false,
		"emergency": true,
		"emergency_justification": "",
		"blocked": true,
		"purpose": "EMERGENCY",
		"research_consent": false,
	}
}

test_emergency_with_justification if {
	fhir_patient_read.allow with input as {
		"has_care_relation": false,
		"emergency": true,
		"emergency_justification": "Akut",
		"blocked": true,
		"purpose": "EMERGENCY",
		"research_consent": false,
	}
}
