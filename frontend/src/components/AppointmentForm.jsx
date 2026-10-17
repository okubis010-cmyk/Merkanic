import { useEffect, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

const today = () => new Date().toISOString().slice(0, 10);

const F = ({ label, children }) => (
  <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>{children}</div>
);

export const AppointmentForm = ({ onCreated, dark }) => {
  const { user } = useAuth();
  const [opts, setOpts] = useState({ services: [], dagdelen: [] });
  const empty = { name: user?.name || "", email: user?.email || "", phone: user?.phone || "", kenteken: "", service: "kleine_beurt", preferred_date: "", dagdeel: "Geen voorkeur", message: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  useEffect(() => { api.get("/public/appointment-options").then((r) => setOpts(r.data)); }, []);
  useEffect(() => {
    if (user) setF((p) => ({ ...p, name: p.name || user.name || "", email: user.email, phone: p.phone || user.phone || "" }));
  }, [user]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { const { data } = await api.post("/public/appointments", f); setDone(data); setF(empty); onCreated?.(data); } catch (x) { setErr(errMsg(x)); }
    setBusy(false);
  };
  const inp = "h-11 rounded-none bg-white";

  if (done)
    return (
      <div data-testid="appointment-success" className="border border-emerald-300 bg-emerald-50 p-6 text-slate-900 fade-up">
        <CalendarCheck className="h-6 w-6 text-emerald-700 mb-3" />
        <h3 className="font-display text-lg font-semibold">Aanvraag ontvangen</h3>
        <p className="mt-1 text-sm text-slate-600">Bedankt {done.name}. We bekijken je aanvraag voor {done.kenteken} ({done.service_name}) op {done.preferred_date} en nemen contact met je op om de afspraak te bevestigen.</p>
        <Button data-testid="appointment-new-button" variant="outline" className="mt-4 rounded-none" onClick={() => setDone(null)}>Nog een aanvraag</Button>
      </div>
    );

  return (
    <form onSubmit={submit} data-testid="appointment-form" className={`grid sm:grid-cols-2 gap-4 ${dark ? "text-slate-900" : ""}`}>
      <F label="Naam *"><Input data-testid="appt-name-input" required minLength={2} className={inp} value={f.name} onChange={set("name")} /></F>
      <F label="E-mailadres *"><Input data-testid="appt-email-input" type="email" required disabled={!!user} className={inp} value={f.email} onChange={set("email")} /></F>
      <F label="Telefoon"><Input data-testid="appt-phone-input" className={inp} value={f.phone} onChange={set("phone")} /></F>
      <F label="Kenteken *"><Input data-testid="appt-kenteken-input" required minLength={4} className={`${inp} font-plate font-extrabold tracking-widest uppercase`} placeholder="AB-123-C" value={f.kenteken} onChange={(e) => setF({ ...f, kenteken: e.target.value.toUpperCase() })} /></F>
      <F label="Dienst *">
        <Select value={f.service} onValueChange={set("service")}>
          <SelectTrigger data-testid="appt-service-select" className="h-11 rounded-none bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>{opts.services.map((s) => <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </F>
      <div className="grid grid-cols-2 gap-3">
        <F label="Voorkeursdatum *"><Input data-testid="appt-date-input" type="date" required min={today()} className={inp} value={f.preferred_date} onChange={set("preferred_date")} /></F>
        <F label="Dagdeel">
          <Select value={f.dagdeel} onValueChange={set("dagdeel")}>
            <SelectTrigger data-testid="appt-dagdeel-select" className="h-11 rounded-none bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{opts.dagdelen.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </F>
      </div>
      <div className="sm:col-span-2"><F label="Toelichting"><Textarea data-testid="appt-message-input" rows={3} maxLength={1000} className="rounded-none bg-white" placeholder="Klachten, wensen of vragen…" value={f.message} onChange={set("message")} /></F></div>
      {err && <p data-testid="appt-error" className="sm:col-span-2 text-sm text-[#C0474A]">{err}</p>}
      <div className="sm:col-span-2">
        <Button data-testid="appt-submit-button" disabled={busy} className="h-12 px-8 rounded-none bg-[#C0474A] hover:bg-[#A8383B]">
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Afspraak aanvragen
        </Button>
      </div>
    </form>
  );
};
