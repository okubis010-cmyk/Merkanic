import { Calendar, Wrench, Package, CheckCircle2, Archive } from "lucide-react";

export const STATUS_STYLE = {
  Gepland: { cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Calendar, dot: "bg-blue-500" },
  "In behandeling": { cls: "bg-amber-50 text-amber-800 border-amber-300", Icon: Wrench, dot: "bg-amber-500" },
  "Wacht op onderdelen": { cls: "bg-purple-50 text-purple-700 border-purple-200", Icon: Package, dot: "bg-purple-500" },
  Gereed: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2, dot: "bg-emerald-500" },
  Afgehaald: { cls: "bg-slate-100 text-slate-700 border-slate-300", Icon: Archive, dot: "bg-slate-400" },
};

export const StatusBadge = ({ status, testid }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Gepland;
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      <s.Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
};
