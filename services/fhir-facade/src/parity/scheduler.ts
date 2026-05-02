// Veckovis paritets-scheduler (Sprint 2 P3.4, steg 4.8).
//
// Polling-baserad: setInterval kör varje minut och triggar
// ParityRunner.runForAll('scheduled') om "nu" matchar söndag 02:00 UTC
// i samma minut som senaste körning *inte* startades.
//
// Statefri: om processen är down vid 02:00 skippas körningen och nästa
// söndag tar över. Spec accepterade detta (4.8 STOPP-villkor förbjuder
// state-persistens-skikt).
//
// Första aktiva körning säkerställs >= 2026-05-10 02:00 UTC genom en
// MIN_FIRST_RUN_AT-konstant. Söndag 2026-05-04 02:00 UTC ligger för nära
// dag-0 (2026-04-30) — vi vill ha ≥7 dagar mellan dag-0-baseline och
// första schedulerad mätpunkt så det blir två oberoende datapunkter.

import type { Logger } from 'pino';
import type { ParityRunner } from './runner.js';

/** Minsta tillåtna timestamp för första schedulerad körning.
 *  Söndag 2026-05-10 02:00:00 UTC. */
const MIN_FIRST_RUN_AT = new Date('2026-05-10T02:00:00Z');

const POLL_INTERVAL_MS = 60_000; // 1 min — granular nog för minut-precision

/** Kollar om aktuell tid är söndag 02:00 UTC (med 1-min-tolerans). */
function isScheduledMinute(now: Date): boolean {
  return now.getUTCDay() === 0 && now.getUTCHours() === 2 && now.getUTCMinutes() === 0;
}

/** Beräknar nästa söndag 02:00 UTC ≥ MIN_FIRST_RUN_AT från en given
 *  starttid. Used för logging vid startup. */
export function nextScheduledRun(from: Date): Date {
  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  // Hoppa till nästa söndag 02:00 UTC
  const daysUntilSunday = (7 - candidate.getUTCDay()) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysUntilSunday);
  candidate.setUTCHours(2, 0, 0, 0);
  // Om kandidaten är i det förflutna (t.ex. det är söndag 03:00),
  // hoppa till nästa söndag.
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  // Säkerställ ≥ MIN_FIRST_RUN_AT
  return candidate.getTime() < MIN_FIRST_RUN_AT.getTime() ? MIN_FIRST_RUN_AT : candidate;
}

export interface ParitySchedulerHandle {
  stop: () => void;
  /** Endast för test — exponerar interna kontroller utan att påverka
   *  produktionsbeteende. */
  _tickForTest?: (now: Date) => Promise<void>;
}

export function startParityScheduler(runner: ParityRunner, logger: Logger): ParitySchedulerHandle {
  let lastFiredMinute: string | null = null; // ISO-min-prefix för debounce
  let stopped = false;

  const tick = async (now: Date): Promise<void> => {
    if (stopped) return;
    if (now.getTime() < MIN_FIRST_RUN_AT.getTime()) return;
    if (!isScheduledMinute(now)) return;
    const minuteKey = now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
    if (lastFiredMinute === minuteKey) return; // redan kört denna minut
    lastFiredMinute = minuteKey;
    logger.info({ scheduled_at: now.toISOString() }, 'scheduled parity run started');
    try {
      const run = await runner.runForAll('scheduled');
      logger.info(
        { run_id: run.run_id, snapshots: run.snapshots.length, failures: run.failures.length },
        'scheduled parity run completed',
      );
    } catch (err) {
      logger.error({ err: String(err) }, 'scheduled parity run crashed — caught, fhir-facade continues');
    }
  };

  const interval = setInterval(() => void tick(new Date()), POLL_INTERVAL_MS);
  const next = nextScheduledRun(new Date());
  logger.info({ next_run_at: next.toISOString() }, 'parity scheduler registered');

  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
    },
    _tickForTest: tick,
  };
}
