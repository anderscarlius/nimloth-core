// SDG-09 baseline-vakt (S1 — determinism bevaras).
//
// Snapshot-test: kör generateTimelines för en liten deterministisk
// delpopulation och fryser (a) eventantal + clinical seed per profil och
// (b) en SHA-256-fingerprint av Mariannes hela timeline.
//
// Snapshotet uppdateras MEDVETET vid varje pathway-ändring via `pnpm test -- -u`
// — om snapshot bryts utan medveten ändring är det en regressions-flag.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateTimelines } from "../engine/TimelineGenerator.js";

interface ProfileBatch {
  profileId: string;
  count: number;
  seed: number;
}

// ~50 patienter över 5 representativa profiler.
const PROFILE_BATCHES: ProfileBatch[] = [
  { profileId: "diabetes_typ2", count: 10, seed: 100 },
  { profileId: "hypertoni", count: 10, seed: 200 },
  { profileId: "hjartsvikt", count: 10, seed: 300 },
  { profileId: "uvi", count: 10, seed: 600 },
  { profileId: "aldre_multisjuk", count: 10, seed: 1000 },
];

function fingerprintTimeline(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

describe("SDG-09 baseline characterization (S1 regression guard)", () => {
  it("frozen event-count + clinical-seed per profile", () => {
    const summary = PROFILE_BATCHES.map((b) => {
      const timelines = generateTimelines(b);
      const totalEvents = timelines.reduce((s, t) => s + t.events.length, 0);
      // Capture severity-fördelning för en strikt determinism-vakt utan att
      // snapshot ska blåsa upp med per-event-detaljer.
      const severities: Record<string, number> = {};
      for (const t of timelines) {
        severities[t.clinical.severity] = (severities[t.clinical.severity] ?? 0) + 1;
      }
      return {
        profile: b.profileId,
        count: b.count,
        seed: b.seed,
        totalEvents,
        severities,
      };
    });
    expect(summary).toMatchSnapshot();
  });

  it("Marianne Lindqvist (seed=42) timeline fingerprint stable", () => {
    const [timeline] = generateTimelines({
      profileId: "aldre_multisjuk",
      count: 1,
      seed: 42,
      forcePatientId: "marianne-lindqvist-syn-001",
    });
    expect({
      patientId: timeline.patientId,
      profileId: timeline.profileId,
      seed: timeline.seed,
      eventCount: timeline.events.length,
      eventTypes: timeline.events.map((e) => e.eventType),
      fingerprint: fingerprintTimeline(timeline),
    }).toMatchSnapshot();
  });
});
