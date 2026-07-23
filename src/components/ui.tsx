import type { ReactNode } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand align-middle ${className}`}
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-no/30 bg-no-softer px-3 py-2 text-sm text-no-strong">
      {message}
    </div>
  );
}

export function Badge({
  tone = "slate",
  children,
}: {
  tone?: "yes" | "no" | "slate" | "amber";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    yes: "bg-yes-soft text-yes-strong",
    no: "bg-no-soft text-no-strong",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Category glyph tile used on cards and market pages. */
const CATEGORY_ICONS: Record<string, { glyph: string; bg: string }> = {
  Politics: { glyph: "🏛️", bg: "bg-indigo-50" },
  Sports: { glyph: "🏆", bg: "bg-orange-50" },
  Crypto: { glyph: "🪙", bg: "bg-amber-50" },
  Economics: { glyph: "📈", bg: "bg-emerald-50" },
  "Tech & Science": { glyph: "🔬", bg: "bg-sky-50" },
  Climate: { glyph: "🌍", bg: "bg-teal-50" },
  Entertainment: { glyph: "🎬", bg: "bg-pink-50" },
  Health: { glyph: "🩺", bg: "bg-rose-50" },
  World: { glyph: "🌐", bg: "bg-blue-50" },
};

export function CategoryTile({
  category,
  imageUrl,
  size = "md",
}: {
  category: string;
  imageUrl?: string;
  size?: "md" | "lg";
}) {
  const dims = size === "lg" ? "h-14 w-14 rounded-xl text-2xl" : "h-10 w-10 rounded-lg text-lg";
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className={`${dims} shrink-0 object-cover`} />;
  }
  const icon = CATEGORY_ICONS[category] ?? { glyph: "📊", bg: "bg-slate-100" };
  return (
    <div className={`${dims} ${icon.bg} flex shrink-0 items-center justify-center`}>
      <span aria-hidden>{icon.glyph}</span>
    </div>
  );
}
