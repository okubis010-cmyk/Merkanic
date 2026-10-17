import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Wrench, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { Plate } from "@/components/Plate";
import { AppointmentForm } from "@/components/AppointmentForm";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, fmtDateTime } from "@/lib/api";

const APPT_STATUSES = ["Aangevraagd", "Bevestigd", "Afgerond", "Geannuleerd"];
const STYLE = { Aangevraagd: "bg-amber-50 text-amber-800 border-amber-300", Bevestigd: "bg-blue-50 text-blue-700 border-blue-200", Afgerond: "bg-emerald-50 text-emerald-700 border-emerald-200", Geannuleerd: "bg-slate-100 text-slate-500 border-slate-300" };
const Badge = ({ s }) => <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLE[s]}`}>{s}</span>;

const StaffActions = ({ a, onSaved }) => {
  const [d, setD] = useState(a.confirmed_date || a.preferred_date);
  const [t, setT] = useState(a.confirmed_time || "");
  const [note, setNote] = useState(a.staff_note || "");
  const patch = async (body) => {
    try {
      const { data } = await api.patch(`/appointments/${a.id}`, body);
      toast.success(data.mail_sent ? "Bijgewerkt — klant is gemaild" : "Afspraak bijgewerkt");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const params = new URLSearchParams({ kenteken: a.kenteken, template: a.service === "overig" ? "vrij" : a.service, opmerking: a.message, naam: a.name, email: a.email, telefoon: a.phone });
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
      {a.status === "Aangevraagd" && (
        <div className="grid sm:grid-cols-[150px_110px_1fr_auto] gap-2">
          <Input data-testid={`appt-confirm-date-${a.id}`} type="date" className="rounded-none" value={d} onChange={(e) => setD(e.target.value)} />
          <Input data-testid={`appt-confirm-time-${a.id}`} type="time" className="rounded-none" value={t} onChange={(e) => setT(e.target.value)} />
          <Input data-testid={`appt-note-${a.id}`} className="rounded-none" placeholder="Bericht aan klant (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button data-testid={`appt-confirm-button-${a.id}`} onClick={() => patch({ status: "Bevestigd", confirmed_date: d, confirmed_time: t, staff_note: note })} className="rounded-none bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4 mr-1" />Bevestigen</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild data-testid={`appt-to-workorder-${a.id}`} className="rounded-none bg-slate-900 hover:bg-[#C0474A]" size="sm">
          <Link to={`/portaal/werkorders/nieuw?${params}`}><Wrench className="h-4 w-4 mr-1" />Maak werkorder</Link>
        </Button>
        {a.status === "Bevestigd" && <Button data-testid={`appt-done-button-${a.id}`} size="sm" variant="outline" className="rounded-none" onClick={() => patch({ status: "Afgerond" })}>Afgerond</Button>}
        {["Aangevraagd", "Bevestigd"].includes(a.status) && <Button data-testid={`appt-cancel-button-${a.id}`} size="sm" variant="ghost" className="rounded-none text-[#C0474A]" onClick={() => patch({ status: "Geannuleerd" })}><X className="h-4 w-4 mr-1" />Annuleren</Button>}
      </div>
    </div>
  );
};

const Card = ({ a, isStaff, reload }) => {
  const cancel = async () => {
    if (!window.confirm("Afspraak annuleren?")) return;
    try { await api.post(`/appointments/${a.id}/cancel`); toast.success("Afspraak geannuleerd"); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div data-testid={`appointment-card-${a.id}`} className="bg-white border border-slate-200 p-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3"><Plate kenteken={a.kenteken} /><span className="font-semibold">{a.service_name}</span><Badge s={a.status} /></div>
        <span className="text-xs text-slate-400">Aangevraagd {fmtDateTime(a.created_at)}</span>
      </div>
      <div className="mt-3 grid sm:grid-cols-3 gap-2 text-sm">
        <div><span className="text-slate-400">Voorkeur:</span> {a.preferred_date} · {a.dagdeel}</div>
        {a.status === "Bevestigd" && <div className="font-semibold text-blue-700" data-testid={`appt-confirmed-${a.id}`}>Bevestigd: {a.confirmed_date} {a.confirmed_time}</div>}
        {isStaff && <div><span className="text-slate-400">Klant:</span> {a.name} · {a.email}{a.phone ? ` · ${a.phone}` : ""}</div>}
      </div>
      {a.message && <p className="mt-2 text-sm text-slate-600 italic">“{a.message}”</p>}
      {a.staff_note && <p className="mt-2 text-sm"><span className="text-slate-400">Merkanic:</span> {a.staff_note}</p>}
      {isStaff ? <StaffActions a={a} onSaved={reload} /> : ["Aangevraagd", "Bevestigd"].includes(a.status) && (
        <Button data-testid={`appt-klant-cancel-${a.id}`} variant="ghost" size="sm" className="mt-3 rounded-none text-[#C0474A]" onClick={cancel}>Annuleren</Button>
      )}
    </div>
  );
};

export default function AppointmentsPage() {
  const { isStaff } = useAuth();
  const [list, setList] = useState(null);
  const [status, setStatus] = useState(isStaff ? "Aangevraagd" : "");
  const load = () => api.get("/appointments", { params: { status } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader eyebrow={isStaff ? "05 / Afspraken" : "02 / Afspraken"} title="Afspraken." accent={isStaff ? "Aanvragen beheren." : "Plan je beurt."} />
      {!isStaff && (
        <div className="bg-white border border-slate-200 p-6 sm:p-8 mb-8">
          <h2 className="font-display text-xl font-semibold mb-5">Nieuwe afspraak aanvragen</h2>
          <AppointmentForm onCreated={load} />
        </div>
      )}
      {isStaff && (
        <div className="flex flex-wrap gap-2 mb-4">
          {["", ...APPT_STATUSES].map((s) => (
            <button key={s || "alle"} data-testid={`appt-filter-${s ? s.toLowerCase() : "alle"}`} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>{s || "Alle"}</button>
          ))}
        </div>
      )}
      {!isStaff && <h2 className="font-display text-lg font-semibold mb-3">Mijn aanvragen</h2>}
      <div className="space-y-3" data-testid="appointment-list">
        {list === null && <div className="text-slate-500">Laden…</div>}
        {list?.length === 0 && <div data-testid="appointment-empty" className="border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">Geen afspraken gevonden.</div>}
        {list?.map((a) => <Card key={a.id} a={a} isStaff={isStaff} reload={load} />)}
      </div>
    </div>
  );
}
