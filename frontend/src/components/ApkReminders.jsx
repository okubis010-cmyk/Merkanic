import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/Plate";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, fmtDateTime } from "@/lib/api";

const Status = ({ r }) => {
  if (r.days_left < 0) return <span className="text-[#C0474A] font-semibold">Verlopen</span>;
  if (!r.owner_email) return <span className="text-slate-400">Geen e-mail</span>;
  if (r.reminders_off) return <span className="text-slate-400">Uitgezet</span>;
  if (r.reminder_sent_at) return <span className="text-emerald-700">Herinnerd {fmtDateTime(r.reminder_sent_at)}</span>;
  return <span className="text-amber-700">{r.days_left <= 30 ? "Wordt gemaild" : "Nog niet"}</span>;
};

export const ApkReminders = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/apk-reminders").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);
  const run = async () => {
    setBusy(true);
    try { const { data: res } = await api.post("/apk-reminders/run"); toast.success(`${res.sent.length} herinnering(en) verstuurd`); load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  if (!data) return null;
  return (
    <section className="mb-10 bg-white border border-slate-200" data-testid="apk-reminders-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-100">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2"><BellRing className="h-4 w-4 text-[#C0474A]" />APK verloopt binnenkort</h2>
          <p className="text-xs text-slate-500 mt-0.5">Klanten krijgen automatisch elke ochtend om 08:00 een mail als hun APK binnen {data.window_days} dagen verloopt.
            {data.last_run && ` Laatste controle: ${fmtDateTime(data.last_run.at)}.`}</p>
        </div>
        {user.role === "beheerder" && (
          <Button data-testid="apk-run-now-button" onClick={run} disabled={busy} variant="outline" className="rounded-none">
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Nu controleren
          </Button>
        )}
      </div>
      {data.vehicles.length === 0 && <div data-testid="apk-reminders-empty" className="p-5 text-sm text-slate-500">Geen auto's met een APK die binnen 60 dagen verloopt.</div>}
      {data.vehicles.map((r) => (
        <Link key={r.kenteken} to={`/portaal/voertuigen/${r.kenteken}`} data-testid={`apk-row-${r.kenteken}`} className="grid grid-cols-2 sm:grid-cols-[130px_1fr_140px_200px] gap-2 items-center px-5 py-3 border-b border-slate-100 text-sm hover:bg-slate-50">
          <div className="justify-self-start"><Plate kenteken={r.kenteken} /></div>
          <div className="truncate">{r.merk} {r.model} · {r.owner_name || "-"}</div>
          <div><span className="font-semibold">{r.apk_vervaldatum}</span> <span className="text-slate-400">({r.days_left} d)</span></div>
          <div className="text-xs"><Status r={r} /></div>
        </Link>
      ))}
    </section>
  );
};
