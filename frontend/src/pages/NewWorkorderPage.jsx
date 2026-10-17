import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { VehicleSection } from "@/components/VehicleSection";
import { api, errMsg, STATUSES, slug } from "@/lib/api";

const EMPTY_V = { kenteken: "", merk: "", model: "", bouwjaar: "", kleur: "", brandstof: "", apk_vervaldatum: "", owner_name: "", owner_email: "", owner_phone: "" };
const Block = ({ n, title, children }) => (
  <section className="bg-white border border-slate-200 p-6 sm:p-8">
    <div className="eyebrow mb-1">Stap {n}</div>
    <h2 className="font-display text-xl font-semibold mb-5">{title}</h2>
    {children}
  </section>
);

export default function NewWorkorderPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [vehicle, setVehicle] = useState({ ...EMPTY_V, kenteken: params.get("kenteken") || "", owner_name: params.get("naam") || "", owner_email: params.get("email") || "", owner_phone: params.get("telefoon") || "" });
  const [templates, setTemplates] = useState([]);
  const [monteurs, setMonteurs] = useState([]);
  const [f, setF] = useState({ km_stand: "", template: params.get("template") || "kleine_beurt", title: "", monteur_id: "", status: "Gepland", planned_date: "", opmerking: params.get("opmerking") || "", opmerking_intern: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/templates").then((r) => setTemplates(r.data));
    api.get("/monteurs").then((r) => setMonteurs(r.data));
  }, []);
  const tpl = templates.find((t) => t.key === f.template);

  const submit = async (e) => {
    e.preventDefault();
    if (!vehicle.kenteken) return toast.error("Vul een kenteken in");
    if (f.km_stand === "") return toast.error("Vul de km-stand in");
    setBusy(true);
    try {
      const { data } = await api.post("/workorders", { ...f, km_stand: parseInt(f.km_stand, 10), vehicle });
      toast.success(`Werkorder ${data.number} aangemaakt in map ${data.kenteken}`);
      nav(`/portaal/werkorders/${data.id}`);
    } catch (x) { toast.error(errMsg(x)); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-5">
      <PageHeader eyebrow="03 / Nieuwe werkorder" title="Nieuwe werkorder." accent="Snel ingeschoten." />
      <Block n="1" title="Voertuig & kenteken"><VehicleSection vehicle={vehicle} setVehicle={setVehicle} /></Block>
      <Block n="2" title="Standaardformulier">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {templates.map((t) => (
            <button type="button" key={t.key} data-testid={`template-select-${slug(t.name)}`} onClick={() => setF({ ...f, template: t.key })}
              className={`text-left border p-4 transition-colors ${f.template === t.key ? "border-[#C0474A] bg-[#FEF2F2]" : "border-slate-200 hover:border-slate-400"}`}>
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-slate-500">{t.checklist.length ? `${t.checklist.length} taken` : "Zelf invullen"}</div>
            </button>
          ))}
        </div>
        {tpl?.checklist.length > 0 && (
          <ul className="text-sm text-slate-600 grid sm:grid-cols-2 gap-x-6 gap-y-1 mb-4" data-testid="template-preview">
            {tpl.checklist.map((c) => <li key={c} className="before:content-['—'] before:mr-2 before:text-slate-300">{c}</li>)}
          </ul>
        )}
        <Label className="text-xs text-slate-500">Omschrijving / titel (optioneel)</Label>
        <Input data-testid="workorder-title-input" className="rounded-none" value={f.title} placeholder={tpl?.name} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Block>
      <Block n="3" title="Km-stand, monteur & status">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label className="text-xs text-slate-500">Km-stand *</Label>
            <Input data-testid="km-stand-input" type="number" min="0" required className="rounded-none" value={f.km_stand} onChange={(e) => setF({ ...f, km_stand: e.target.value })} /></div>
          <div><Label className="text-xs text-slate-500">Geplande datum</Label>
            <Input data-testid="planned-date-input" type="date" className="rounded-none" value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} /></div>
          <div><Label className="text-xs text-slate-500">Monteur</Label>
            <Select value={f.monteur_id || "none"} onValueChange={(v) => setF({ ...f, monteur_id: v === "none" ? "" : v })}>
              <SelectTrigger data-testid="werkorder-monteur-select" className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nog niet toegewezen</SelectItem>{monteurs.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label className="text-xs text-slate-500">Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger data-testid="werkorder-status-select" className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
      </Block>
      <Block n="4" title="Opmerkingen">
        <Textarea data-testid="opmerking-input" rows={4} className="rounded-none" placeholder="Klacht, wensen van de klant, bijzonderheden…" value={f.opmerking} onChange={(e) => setF({ ...f, opmerking: e.target.value })} />
        <label className="flex items-center gap-2 mt-3 text-sm text-slate-600">
          <Switch data-testid="opmerking-intern-switch" checked={f.opmerking_intern} onCheckedChange={(v) => setF({ ...f, opmerking_intern: v })} />Interne notitie (niet zichtbaar voor klant)
        </label>
      </Block>
      <Button data-testid="werkorder-form-submit-button" disabled={busy} className="h-12 px-8 rounded-none bg-[#C0474A] hover:bg-[#A8383B]">{busy ? "Opslaan…" : "Werkorder aanmaken"}</Button>
    </form>
  );
}
