// Lineage-route (f) — composition_uid → live EHRbase-resolve.
//
// För riktiga UIDs (Ingrid): HTTP 200 med composer/template/start_time/
// content_summary + commit-audit.
//
// För syntetiska 'synth:...'-UIDs (preloaded-bredd från synthetic-bulk-loader):
// HTTP 404 med {source:'preloaded', reason:'...'}. Det är sömmens ärlighet i
// HTTP-form — preloaded-rader pekar på UIDs som ALDRIG fanns i CDR.
//
// ÄRLIGHET: ingen fabricerad signatär. Vi returnerar exakt vad EHRbase håller,
// som typiskt är "EHRbase Internal anonymousUser" på syntetisk data.

import express, { type Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import { type EhrbaseClient, extractContentSummary } from '../ehrbase-client.js';

export function buildLineageRouter(ehr: EhrbaseClient, logger: Logger): Router {
  const r = express.Router();

  r.get('/composition/:uid', async (req: Request, res: Response) => {
    const uid = req.params.uid;
    const uuidOnly = uid.split('::')[0];

    // Synthetic-bulk-loader UIDs börjar med 'synth:' — preloaded-bredd har INGA
    // EHRbase-kompositioner. 404 är korrekt och ärlig.
    if (uid.startsWith('synth:')) {
      res.status(404).json({
        error: 'preloaded_no_cdr',
        composition_uid: uid,
        source: 'preloaded',
        reason:
          'Detta är ett syntetiskt UID från synthetic-bulk-loader. Pålastad bredd har ingen CDR-källa — kedjan bryts här. Det är sömmens ärlighetsanslag, inte en bugg.',
      });
      return;
    }

    try {
      const ehrId = await ehr.resolveEhrId(uid);
      if (!ehrId) {
        res.status(404).json({
          error: 'composition_not_found',
          composition_uid: uid,
          reason: 'Inget EHR innehåller denna composition_uid (kan vara raderad eller felaktig).',
        });
        return;
      }

      const composition = await ehr.getComposition(ehrId, uuidOnly);
      if (!composition) {
        res.status(404).json({
          error: 'composition_not_found',
          composition_uid: uid,
          ehr_id: ehrId,
        });
        return;
      }

      const audit = await ehr.getCommitAudit(ehrId, uuidOnly);

      const archetypeDetails = composition.archetype_details as
        | { template_id?: { value?: string } }
        | undefined;
      const context = composition.context as
        | { start_time?: { value?: string } }
        | undefined;
      const composer = composition.composer as { name?: string } | undefined;

      res.json({
        composition_uid: uid,
        ehr_id: ehrId,
        composer_name: composer?.name ?? null,
        template_id: archetypeDetails?.template_id?.value ?? null,
        start_time: context?.start_time?.value ?? null,
        content_summary: extractContentSummary(composition),
        commit_audit: audit,
      });
    } catch (e) {
      logger.error({ err: (e as Error).message, uid }, 'lineage-resolve failed');
      res.status(500).json({ error: 'lineage_failed', message: (e as Error).message });
    }
  });

  return r;
}
