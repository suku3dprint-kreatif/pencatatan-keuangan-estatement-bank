import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/**
 * Legend selalu ada untuk chart dengan ≥2 seri, supaya identitas seri tidak
 * pernah bergantung pada warna saja.
 */
export function Legend({
  items,
}: {
  items: { label: string; color: string; marker?: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ background: item.color }}
          />
          {item.marker ? <span aria-hidden className="text-[11px]">{item.marker}</span> : null}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-hairline text-xs text-ink-muted">
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  const styles: Record<string, string> = {
    neutral: "border-hairline text-ink-2",
    good: "border-[color:var(--status-good)] text-[color:var(--delta-good)]",
    warning: "border-[color:var(--status-warning)] text-ink-2",
    critical: "border-[color:var(--status-critical)] text-[color:var(--status-critical)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

/** Tooltip chart. Semua chart pakai bentuk yang sama supaya konsisten. */
export function TooltipShell({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="pointer-events-none rounded-lg border border-hairline bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-ink">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs text-ink-2">
            {row.color ? (
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: row.color }}
              />
            ) : null}
            <span>{row.label}</span>
            <span className="tabular ml-auto font-medium text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
