export type Bar = { label: string; value: number; title?: string };

// A small dependency-free bar chart (plain HTML), good for orders or sales over time.
export function BarChart({ data, format, ariaLabel, color = "bg-palm-600" }: { data: Bar[]; format: (n: number) => string; ariaLabel: string; color?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max === 0) return <p className="grid h-40 place-items-center rounded-lg bg-paper-100 text-sm text-ink-600">Nothing to show for this period yet.</p>;
  const every = data.length > 14 ? Math.ceil(data.length / 10) : 1;
  return (
    <figure aria-label={ariaLabel}>
      <p className="mb-1 text-xs text-ink-600">Highest: {format(max)}</p>
      <div className="flex h-40 items-end gap-[3px] border-b border-paper-300">
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 items-end" title={d.title ?? `${d.label}: ${format(d.value)}`}>
            <div className={`w-full rounded-t ${d.value > 0 ? color : "bg-paper-200"}`} style={{ height: `${d.value > 0 ? Math.max(3, (d.value / max) * 100) : 1}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[10px] text-ink-600">
        {data.map((d, i) => <span key={d.label} className="flex-1 overflow-visible whitespace-nowrap text-center">{i % every === 0 ? d.label : ""}</span>)}
      </div>
    </figure>
  );
}
