import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg } from "@/lib/api";

const FIELDS = [["merk", "Merk"], ["model", "Model"], ["bouwjaar", "Bouwjaar"], ["brandstof", "Brandstof"], ["kleur", "Kleur"], ["apk_vervaldatum", "APK tot"]];
const OWNER = [["owner_name", "Naam eigenaar"], ["owner_phone", "Telefoon"], ["owner_email", "E-mail (koppelt klantaccount)"]];
const norm = (k) => k.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const VehicleSection = ({ vehicle, setVehicle }) => {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/vehicles").then((r) => setList(r.data)); }, []);
  useEffect(() => {
    const k = norm(vehicle.kenteken);
    const found = list.find((v) => v.kenteken === k);
    if (found && !vehicle.merk) setVehicle((p) => ({ ...p, ...Object.fromEntries(Object.entries(found).filter(([key]) => key in p)) }));
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (k) => {
    const v = list.find((x) => x.kenteken === k);
    setVehicle((p) => ({ ...p, ...Object.fromEntries(Object.entries(v).filter(([key]) => key in p)) }));
  };
  const lookup = async () => {
    if (!vehicle.kenteken) return toast.error("Vul eerst een kenteken in");
    setBusy(true);
    try {
      const { data } = await api.get(`/rdw/${norm(vehicle.kenteken)}`);
      setVehicle((p) => ({ ...p, ...data }));
      toast.success(`RDW: ${data.merk} ${data.model}`);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const existing = list.find((v) => v.kenteken === norm(vehicle.kenteken));

  return (
    <div className="space-y-5">
      {list.length > 0 && (
        <div><Label className="text-xs text-slate-500">Kies bestaande auto uit lijst</Label>
          <Select value={existing ? existing.kenteken : ""} onValueChange={pick}>
            <SelectTrigger data-testid="existing-vehicle-select" className="rounded-none"><SelectValue placeholder="Selecteer een auto…" /></SelectTrigger>
            <SelectContent>{list.map((v) => <SelectItem key={v.kenteken} value={v.kenteken}>{v.kenteken} — {v.merk} {v.model}{v.owner_name ? ` (${v.owner_name})` : ""}</SelectItem>)}</SelectContent>
          </Select></div>
      )}
      <div>
        <Label className="text-xs text-slate-500">Kenteken *</Label>
        <div className="flex gap-2">
          <div className="flex flex-1 items-stretch border-2 border-slate-900 bg-[#FACC15] rounded-[5px] overflow-hidden">
            <span className="bg-[#1D4ED8] text-white text-xs font-bold px-2 flex items-end pb-2">NL</span>
            <input data-testid="kenteken-input" value={vehicle.kenteken} onChange={(e) => setVehicle({ ...vehicle, kenteken: e.target.value.toUpperCase() })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }}
              placeholder="AB-123-C" className="flex-1 min-w-0 bg-transparent px-3 py-2 font-plate font-extrabold text-xl tracking-widest outline-none placeholder:text-slate-900/30" />
          </div>
          <Button type="button" data-testid="rdw-lookup-button" onClick={lookup} disabled={busy} className="h-auto rounded-none bg-slate-900 hover:bg-[#C0474A]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="ml-1 hidden sm:inline">RDW ophalen</span>
          </Button>
        </div>
        {existing && <p data-testid="existing-vehicle-note" className="text-xs text-emerald-700 mt-1.5">Bestaande map gevonden — order wordt toegevoegd als order {existing.order_count + 1}.</p>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {FIELDS.map(([k, l]) => (
          <div key={k}><Label className="text-xs text-slate-500">{l}</Label>
            <Input data-testid={`vehicle-${k}-input`} className="rounded-none" value={vehicle[k]} onChange={(e) => setVehicle({ ...vehicle, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
        {OWNER.map(([k, l]) => (
          <div key={k}><Label className="text-xs text-slate-500">{l}</Label>
            <Input data-testid={`vehicle-${k}-input`} className="rounded-none" value={vehicle[k]} onChange={(e) => setVehicle({ ...vehicle, [k]: e.target.value })} /></div>
        ))}
      </div>
    </div>
  );
};
