type MetricTileProps = {
  label: string;
  value: string;
  detail: string;
};

export function MetricTile({ label, value, detail }: MetricTileProps) {
  return (
    <article className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-4 backdrop-blur-sm">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/62">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-white/72">{detail}</p>
    </article>
  );
}
