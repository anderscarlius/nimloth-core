// Litet badge som visar varifrån en datapost kommer (Melior/Asynja).

export default function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const isMelior = source.toLowerCase().includes('melior');
  const cls = isMelior ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{source}</span>;
}
