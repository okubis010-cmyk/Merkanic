import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";

const FIELDS = [["merk", "Merk"], ["model", "Model"], ["bouwjaar", "Bouwjaar"], ["kleur", "Kleur"], ["brandstof", "Brandstof"], ["apk_vervaldatum", "APK tot"], ["owner_name", "Eigenaar naam"], ["owner_email", "Eigenaar e-mail (koppelt klantaccount)"], ["owner_phone", "Eigenaar telefoon"]];

export const VehicleEditDialog = ({ open, onOpenChange, vehicle, onSaved }) => {
  const [f, setF] = useState({});
  useEffect(() => { setF({ ...Object.fromEntries(FIELDS.map(([k]) => [k, vehicle[k] || ""])), apk_reminders_off: !!vehicle.apk_reminders_off }); }, [vehicle, open]);
  const save = async () => {
    try { await api.patch(`/vehicles/${vehicle.kenteken}`, f); toast.success("Voertuig opgeslagen"); onOpenChange(false); onSaved(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-lg" data-testid="vehicle-edit-dialog">
        <DialogHeader><DialogTitle className="font-display">Voertuiggegevens {vehicle.kenteken}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          {FIELDS.map(([k, l]) => (
            <div key={k} className={k === "owner_email" ? "sm:col-span-2" : ""}>
              <Label className="text-xs text-slate-500">{l}</Label>
              <Input data-testid={`vehicle-edit-${k}`} className="rounded-none" value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Switch data-testid="vehicle-edit-apk-reminders" checked={!f.apk_reminders_off} onCheckedChange={(v) => setF({ ...f, apk_reminders_off: !v })} />
          Automatische APK-herinnering per e-mail
        </label>
        <Button data-testid="vehicle-edit-save" onClick={save} className="rounded-none bg-[#C0474A] hover:bg-[#A8383B]">Opslaan</Button>
      </DialogContent>
    </Dialog>
  );
};
