import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { Checklist } from "@/components/Checklist";
import { Comments } from "@/components/Comments";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, STATUSES, fmtDateTime, fmtKm } from "@/lib/api";

const StaffControls = ({ o, update }) => {
  const [monteurs, setMonteurs] = useState([]);
  const [km, setKm] = useState(o.km_stand);
  useEffect(() => { api.get("/monteurs").then((r) => setMonteurs(r.data)); }, []);
  return (
    <div className="bg-white border border-slate-200 p-6 space-y-4">
      <div><Label className="text-xs text-slate-500">Status van het werk</Label>
        <Select value={o.status} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger data-testid="werkorder-status-select" className="rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select></div>
      <div><Label className="text-xs text-slate-500">Monteur</Label>
        <Select value={o.monteur_id || "none"} onValueChange={(v) => update({ monteur_id: v === "none" ? "" : v })}>
          <SelectTrigger data-testid="werkorder-monteur-select" className="rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Niet toegewezen</SelectItem>{monteurs.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select></div>
      <div><Label className="text-xs text-slate-500">Km-stand</Label>
        <div className="flex gap-2">
          <Input data-testid="detail-km-input" type="number" min="0" className="rounded-none" value={km} onChange={(e) => setKm(e.target.value)} />
          <Button data-testid="detail-km-save" variant="outline" className="rounded-none" disabled={String(km) === String(o.km_stand) || km === ""} onClick={() => update({ km_stand: parseInt(km, 10) })}>Opslaan</Button>
        </div></div>
    </div>
  );
};

export default function WorkorderDetailPage() {
  const { id } = useParams();
  const { isStaff, user } = useAuth();
  const nav = useNavigate();
  const [o, setO] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.get(`/workorders/${id}`).then((r) => setO(r.data)).catch(() => setErr("Werkorder niet gevonden.")); }, [id]);

  const update = async (patch) => {
    try { const { data } = await api.patch(`/workorders/${id}`, patch); setO(data); toast.success("Werkorder bijgewerkt"); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!window.confirm("Werkorder definitief verwijderen?")) return;
    await api.delete(`/workorders/${id}`); toast.success("Verwijderd"); nav(`/portaal/voertuigen/${o.kenteken}`);
  };
  if (err) return <div data-testid="workorder-not-found" className="text-slate-500">{err}</div>;
  if (!o) return <div className="text-slate-500">Laden…</div>;
  return (
    <div className="fade-up">
      <Link to={`/portaal/voertuigen/${o.kenteken}`} data-testid="back-to-folder" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6"><ArrowLeft className="h-4 w-4" />Map {o.kenteken}</Link>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="eyebrow mb-3">{o.number} / Order {o.volgnummer} van deze auto</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight" data-testid="workorder-title">{o.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-slate-500">
            <Plate kenteken={o.kenteken} /><span>{o.vehicle?.merk} {o.vehicle?.model}</span><span>· {fmtKm(o.km_stand)}</span><span>· {o.template_name}</span>
            <StatusBadge status={o.status} testid="workorder-status-badge" />
          </div>
        </div>
        {user.role === "beheerder" && <Button data-testid="delete-workorder-button" variant="outline" className="rounded-none text-[#C0474A]" onClick={remove}><Trash2 className="h-4 w-4 mr-1" />Verwijderen</Button>}
      </div>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          <Checklist o={o} setO={setO} editable={isStaff} />
          <Comments o={o} setO={setO} />
        </div>
        <div className="space-y-6">
          {isStaff ? <StaffControls key={o.km_stand} o={o} update={update} /> : (
            <div className="bg-white border border-slate-200 p-6 text-sm space-y-2">
              <div><span className="text-slate-400">Monteur:</span> {o.monteur_name || "-"}</div>
              <div><span className="text-slate-400">Status:</span> {o.status}</div>
            </div>
          )}
          <div className="bg-white border border-slate-200 p-6">
            <h3 className="font-display font-semibold mb-3">Logboek</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto" data-testid="workorder-events">
              {[...o.events].reverse().map((e) => (
                <div key={e.id} className="text-sm"><div className="text-xs text-slate-400">{fmtDateTime(e.at)} · {e.by}</div>{e.text}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
