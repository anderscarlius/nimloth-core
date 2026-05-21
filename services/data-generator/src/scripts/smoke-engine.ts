import { generateTimelines } from "../engine/TimelineGenerator.js";

const profiles = [
  "diabetes_typ2",
  "hypertoni",
  "hjartsvikt",
  "kol",
  "anemi",
  "uvi",
  "depression",
  "brostsmarta",
  "ryggsmarta",
  "aldre_multisjuk",
];

async function main() {
  for (const profileId of profiles) {
    const t = generateTimelines({ profileId, count: 3, seed: 100 });
    const n = t.length;
    const evCount = t.reduce((s, x) => s + x.events.length, 0);
    const minDay = Math.min(...t.flatMap((x) => x.events.map((e) => e.dayOffset)));
    const maxDay = Math.max(...t.flatMap((x) => x.events.map((e) => e.dayOffset)));
    const eventTypes = new Set(t.flatMap((x) => x.events.map((e) => e.eventType)));
    console.log(
      `  ${profileId.padEnd(20)} ${n} patients, ${evCount} events, day-range ${minDay}..${maxDay}, types=${[...eventTypes].sort().join(",")}`,
    );
    if (evCount === 0) {
      console.error(`    ✗ ZERO events generated for ${profileId}`);
      process.exit(2);
    }
  }
  console.log("All profiles produced non-empty timelines.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
