import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, MessageSquare, UserCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Plate } from "@/components/Plate";
import { StatusBadge, STATUS_STYLE } from "@/components/StatusBadge";
import { api, STATUSES, slug, fmtDate, fmtKm } from "@/lib/api";

const StatCard = ({ label, value, dot, testid }) => (
  <div data-testid={testid} className="bg-white border border-slate-200 p-5">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}{label}
    </div>
    <div className="font-display text-3xl font-bold mt-2">{value}</div>
  </div>
);

const OrderRow = ({ o }) => (
  <Link to={`/portaal/werkorders/${o.id}`} data-testid={`workorder-row-${o.number}`} className="grid grid-cols-1 md:grid-cols-[130px_1fr_150px_170px_110px] gap-3 md:items-center px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors">
    <Plate kenteken={o.kenteken} />
    <div className="min-w-0">
      <div className="font-semibold truncate">{o.title} <span className="text-slate-400 font-normal text-sm">· {o.number} · order {o.volgnummer}</span></div>
      <div className="text-sm text-slate-500 truncate">{o.vehicle_label || "Onbekend voertuig"}{o.owner_name ? ` · ${o.owner_name}` : ""} · {fmtKm(o.km_stand)}</div>
    </div>
    <div className="text-sm text-slate-600 flex items-center gap-1.5"><UserCog className="h-4 w-4 text-slate-400" />{o.monteur_name || <span className="text-slate-400">Geen monteur</span>}</div>
    <div className="flex items-center gap-3"><StatusBadge status={o.status} /></div>
    <div className="text-xs text-slate-500 flex md:flex-col gap-2 md:gap-0.5">
      <span>{fmtDate(o.created_at)}</span>
      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{o.comment_count} · {o.checklist_done}/{o.checklist_total}</span>
    </div>
  </Link>
);

export default function WorkordersPage() {
  const [orders, setOrders] = useState(null);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/workorders", { params: { status, q } }).then((r) => setOrders(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [status, q]);

  const active = stats ? stats.by_status["Gepland"] + stats.by_status["In behandeling"] + stats.by_status["Wacht op onderdelen"] : "-";
  return (
    <div>
      <PageHeader eyebrow="01 / Werkplaats" title="Werkorders." accent="Alles in één overzicht.">
        <Button asChild className="rounded-none bg-[#C0474A] hover:bg-[#A8383B]" data-testid="new-workorder-button">
          <Link to="/portaal/werkorders/nieuw"><Plus className="h-4 w-4 mr-1" />Nieuwe werkorder</Link>
        </Button>
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard testid="stat-actief" label="Actieve werkorders" value={active} dot="bg-[#C0474A]" />
        <StatCard testid="stat-in-behandeling" label="In behandeling" value={stats?.by_status["In behandeling"] ?? "-"} dot={STATUS_STYLE["In behandeling"].dot} />
        <StatCard testid="stat-wacht" label="Wacht op onderdelen" value={stats?.by_status["Wacht op onderdelen"] ?? "-"} dot={STATUS_STYLE["Wacht op onderdelen"].dot} />
        <StatCard testid="stat-voertuigen" label="Voertuigen (mappen)" value={stats?.vehicles ?? "-"} />
      </div>
      {stats?.pending_users > 0 && (
        <Link to="/portaal/gebruikers" data-testid="pending-users-alert" className="block mb-6 border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          {stats.pending_users} registratie(s) wachten op goedkeuring — bekijk Gebruikers.
        </Link>
      )}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          {["", ...STATUSES].map((s) => (
            <button key={s || "alle"} data-testid={`filter-status-${s ? slug(s) : "alle"}`} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
              {s || "Alle"}{stats && s ? ` (${stats.by_status[s]})` : ""}
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input data-testid="workorder-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek kenteken, klant, order…" className="pl-9 rounded-none bg-white" />
        </div>
      </div>
      <div className="bg-white border border-slate-200" data-testid="workorder-list">
        {orders === null && <div className="p-8 text-slate-500">Laden…</div>}
        {orders?.length === 0 && <div data-testid="workorder-empty" className="p-10 text-center text-slate-500">Geen werkorders gevonden.</div>}
        {orders?.map((o) => <OrderRow key={o.id} o={o} />)}
      </div>
    </div>
  );
}
