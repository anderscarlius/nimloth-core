import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchObservationTrend,
  fetchResponder,
  fetchNonresponder,
  fetchFollowupStatus,
  type ResponderRow,
  type FollowupRow,
} from '../lib/aql-template-client';

export interface ObservationTrendProps {
  patientId: string;
  /** Analyt-namn (matchar analyte_name i lab-compositionen). Default HBA1C. */
  analyte?: string;
  fromDate?: string;
  toDate?: string;
  /** Visa responder/non-responder-badge (quality-measure-mall). Default true.
   *  Badge är meningsfull endast för HbA1c (mallarna är HbA1c-specifika). */
  showResponderBadge?: boolean;
}

/**
 * Mätvärdestrend — ritar en analyt-trend (data-query-mall) över tid + en
 * deskriptiv responder-badge (quality-measure-mall). Två mall-källor
 * komponerade till en vy — en mini-Compose.
 */
export default function ObservationTrend({
  patientId,
  analyte = 'HBA1C',
  fromDate,
  toDate,
  showResponderBadge = true,
}: ObservationTrendProps) {
  const trend = useQuery({
    queryKey: ['obs-trend', patientId, analyte, fromDate, toDate],
    queryFn: () => fetchObservationTrend(patientId, { analyte, fromDate, toDate }),
    enabled: Boolean(patientId),
  });

  const badgeEnabled = showResponderBadge && analyte === 'HBA1C' && Boolean(patientId);
  const responder = useQuery({
    queryKey: ['responder', patientId],
    queryFn: () => fetchResponder(patientId),
    enabled: badgeEnabled,
  });
  const nonresponder = useQuery({
    queryKey: ['nonresponder', patientId],
    queryFn: () => fetchNonresponder(patientId),
    enabled: badgeEnabled,
  });
  const followup = useQuery({
    queryKey: ['followup', patientId],
    queryFn: () => fetchFollowupStatus(patientId),
    enabled: badgeEnabled,
  });

  const rows = trend.data?.rows ?? [];
  const unit = rows[0]?.unit ?? '';

  const chartData = rows.map((p) => ({
    date: p.timestamp.slice(0, 10),
    value: p.magnitude,
  }));

  return (
    <section className="bg-white border rounded-md p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-700">
          Mätvärdestrend — {analyte}
        </h2>
        {badgeEnabled && (
          <AdaptiveBadge
            responder={responder.data?.rows[0]}
            nonresponder={nonresponder.data?.rows[0]}
            followup={followup.data?.rows[0]}
          />
        )}
      </div>

      {trend.isLoading && <p className="text-sm text-gray-500 py-8 text-center">Laddar…</p>}

      {trend.isError && (
        <p className="text-sm text-core-red py-8 text-center">
          Kunde inte hämta trend: {(trend.error as Error).message}
        </p>
      )}

      {!trend.isLoading && !trend.isError && rows.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-500">Inga {analyte}-mätningar för denna patient i perioden.</p>
          <p className="text-xs text-gray-400 mt-1">
            (T.ex. en dropout-patient utan uppföljande prov, eller en patient utan denna analyt.)
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis
                fontSize={11}
                label={{ value: unit, angle: -90, position: 'insideLeft', fontSize: 11 }}
                domain={['dataMin - 5', 'dataMax + 5']}
              />
              <Tooltip
                formatter={(v: number) => [`${v} ${unit}`, analyte]}
                labelFormatter={(d) => `Datum: ${d}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            {rows.length} mätning{rows.length === 1 ? '' : 'ar'} · enhet {unit} ·{' '}
            mall <code>observation_trend_by_period</code> ({trend.data?.meta.total_ms} ms)
          </p>
        </>
      )}
    </section>
  );
}

/** Adaptiv, deskriptiv badge — ALDRIG imperativ. Väljer tillämplig
 *  quality-measure-mall per patient:
 *    responder (grön) → non-responder (gul) → dropout (röd-grå).
 *  Ingen tillämplig mall (t.ex. Karin utan HbA1c) → ingen badge (ärligt tomt).
 *  Precedens: en patient kan bara vara ett av responder/non-responder; dropout
 *  visas bara om ingen trend-klassificering finns (en mätning → ingen delta). */
function AdaptiveBadge({
  responder,
  nonresponder,
  followup,
}: {
  responder?: ResponderRow;
  nonresponder?: ResponderRow;
  followup?: FollowupRow;
}) {
  if (responder) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
        responder: HbA1c {responder.delta} mmol/mol
      </span>
    );
  }
  if (nonresponder) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        non-responder: HbA1c +{nonresponder.delta} mmol/mol
      </span>
    );
  }
  if (followup?.status === 'dropout') {
    const after = followup.diagnosis_date ? followup.diagnosis_date.slice(0, 10) : 'diagnos';
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
        ingen uppföljning efter {after}
      </span>
    );
  }
  return null;
}
