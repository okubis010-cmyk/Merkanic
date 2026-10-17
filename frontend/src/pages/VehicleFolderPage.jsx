import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Plus, History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleEditDialog } from "@/components/VehicleEditDialog";
import { useAuth } from "@/context/AuthContext";
import { api, fmtDate, fmtDateTime, fmtKm } from "@/lib/api";

const Spec = ({ label, value }) => (
  <div><div className="text-xs uppercase tracking-wider text-slate-400">{label}</div><div className="font-medium break-all">{value || "-"}</div></div>
);

const Timeline = ({ history }) => (
  <div data-testid="vehicle-history-timeline" className="relative pl-5 border-l border-slate-200 space-y-5">
    {history.length === 0 && <div className="text-sm text-slate-500">Nog geen historie.</div>}
    {history.map((h, i) => (
      <div key={`${h.at}-${i}`} className="relative">
        <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ${h.type === "comment" ? "bg-[#C0474A]" : "bg-slate-400"}`} />
        <div className="text-xs text-slate-400">{fmtDateTime(h.at)} · {h.by} · <Link className="hover:text-[#C0474A] underline-offset-2 hover:underline" to={`/portaal/werkorders/${h.order_id}`}>Order {h.volgnummer}</Link>{h.internal ? " · intern" : ""}</div>
        <div className={`text-sm ${h.type === "comment" ? "italic text-slate-700" : "text-slate-800"}`}>{h.type === "comment" ? `“${h.text}”` : h.text}</div>
      </div>
    ))}
  </div>
);

export default function VehicleFolderPage() {
  const { kenteken } = useParams();
  const { isStaff } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(false);
  const load = () => api.get(`/vehicles/${kenteken}`).then((r) => setData(r.data)).catch(() => setErr("Voertuig niet gevonden."));
  useEffect(() => { load(); }, [kenteken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div data-testid="vehicle-not-found" className="text-slate-500">{err}</div>;
  if (!data) return <div className="text-slate-500">Laden…</div>;
  const v = data.vehicle;
  return (
    <div className="fade-up">
      <Link to={isStaff ? "/portaal/voertuigen" : "/portaal"} data-testid="back-to-vehicles" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6"><ArrowLeft className="h-4 w-4" />Alle mappen</Link>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="eyebrow mb-3">Map / {v.kenteken}</div>
          <Plate kenteken={v.kenteken} size="lg" testid="folder-plate" />
          <h1 className="font-display text-3xl font-bold tracking-tight mt-4">{v.merk} {v.model} <span className="font-serif-accent font-medium text-[#C0474A]">{data.orders.length} orders.</span></h1>
        </div>
        {isStaff && (
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-none" data-testid="edit-vehicle-button" onClick={() => setEdit(true)}><Pencil className="h-4 w-4 mr-1" />Gegevens</Button>
            <Button asChild className="rounded-none bg-[#C0474A] hover:bg-[#A8383B]" data-testid="folder-new-order-button">
              <Link to={`/portaal/werkorders/nieuw?kenteken=${v.kenteken}`}><Plus className="h-4 w-4 mr-1" />Nieuwe order</Link>
            </Button>
          </div>
        )}
      </div>
      <div className="bg-white border border-slate-200 p-6 grid grid-cols-2 md:grid-cols-4 gap-5 mb-8" data-testid="vehicle-specs">
        <Spec label="Bouwjaar" value={v.bouwjaar} /><Spec label="Kleur" value={v.kleur} /><Spec label="Brandstof" value={v.brandstof} /><Spec label="APK tot" value={v.apk_vervaldatum} />
        <Spec label="Eigenaar" value={v.owner_name} /><Spec label="E-mail" value={v.owner_email} /><Spec label="Telefoon" value={v.owner_phone} /><Spec label="Laatste km" value={fmtKm(v.last_km)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        <section className="min-w-0">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-[#C0474A]" />Orders in deze map</h2>
          <div className="bg-white border border-slate-200">
            {data.orders.length === 0 && <div className="p-6 text-sm text-slate-500">Nog geen orders.</div>}
            {[...data.orders].reverse().map((o) => (
              <Link key={o.id} to={`/portaal/werkorders/${o.id}`} data-testid={`vehicle-order-item-${o.volgnummer}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="font-display font-bold text-2xl text-slate-300 w-10">{String(o.volgnummer).padStart(2, "0")}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Order {o.volgnummer} · {o.title}</div>
                  <div className="text-xs text-slate-500">{o.number} · {fmtDate(o.created_at)} · {fmtKm(o.km_stand)} · {o.monteur_name || "geen monteur"}</div>
                </div>
                <StatusBadge status={o.status} />
              </Link>
            ))}
          </div>
        </section>
        <section className="min-w-0">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4 text-[#C0474A]" />Historie van de auto</h2>
          <div className="bg-white border border-slate-200 p-6 max-h-[640px] overflow-y-auto"><Timeline history={data.history} /></div>
        </section>
      </div>
      {isStaff && <VehicleEditDialog open={edit} onOpenChange={setEdit} vehicle={v} onSaved={load} />}
    </div>
  );
}
