import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

const Field = ({ id, label, ...p }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <Input id={id} data-testid={`${id}-input`} className="h-11 rounded-none bg-white" {...p} />
  </div>
);

const LoginForm = () => {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await login(f.email, f.password); nav("/portaal"); } catch (x) { setErr(errMsg(x)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field id="login-email" label="E-mailadres" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Field id="login-password" label="Wachtwoord" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      {err && <p data-testid="login-error" className="text-sm text-[#C0474A]">{err}</p>}
      <Button data-testid="login-submit-button" disabled={busy} className="h-11 w-full rounded-none bg-slate-900 hover:bg-[#C0474A]">{busy ? "Bezig…" : "Inloggen"}</Button>
    </form>
  );
};

const RegisterForm = () => {
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api.post("/auth/register", f); setDone(true); } catch (x) { setErr(errMsg(x)); }
    setBusy(false);
  };
  if (done)
    return (
      <div data-testid="pending-approval-card" className="border border-amber-300 bg-amber-50 p-6 fade-up">
        <Clock className="h-6 w-6 text-amber-700 mb-3" />
        <h3 className="font-display text-lg font-semibold">Wacht op goedkeuring</h3>
        <p className="mt-1 text-sm text-slate-600">Je registratie is ontvangen. Merkanic krijgt een melding en wijst je een rol toe. Daarna kun je inloggen.</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field id="register-name" label="Naam" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Field id="register-email" label="E-mailadres" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Field id="register-phone" label="Telefoon (optioneel)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <Field id="register-password" label="Wachtwoord (min. 6 tekens)" type="password" minLength={6} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      {err && <p data-testid="register-error" className="text-sm text-[#C0474A]">{err}</p>}
      <Button data-testid="register-submit-button" disabled={busy} className="h-11 w-full rounded-none bg-slate-900 hover:bg-[#C0474A]">{busy ? "Bezig…" : "Registreren"}</Button>
    </form>
  );
};

export default function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "register" ? "register" : "login");
  if (user) return <Navigate to="/portaal" replace />;
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#F1F5F9]">
      <div className="hidden lg:block relative overflow-hidden bg-slate-900">
        <img src="https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400" alt="Werkplaats" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="relative z-10 flex h-full flex-col justify-end p-14 text-white">
          <div className="eyebrow mb-4">03 / Klantenportaal</div>
          <h1 className="font-display text-5xl font-bold tracking-tight leading-tight">Klantenportaal.<br /><span className="font-serif-accent font-medium text-[#f08b8d]">Alles van jouw auto.</span></h1>
          <p className="mt-5 max-w-md text-slate-300">Werkorders, onderhoudshistorie per kenteken, monteur-notities en status — voor klant en werkplaats in één overzicht.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-md bg-white border border-slate-200 p-8 sm:p-10 fade-up">
          <Link to="/" data-testid="login-home-link" className="font-display text-2xl font-extrabold tracking-tight mb-1 inline-block">MERKANIC<span className="text-[#C0474A]">.</span></Link>
          <div className="flex border-b border-slate-200 my-6">
            {[["login", "Inloggen"], ["register", "Registreren"]].map(([k, l]) => (
              <button key={k} data-testid={`tab-${k}`} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === k ? "border-[#C0474A] text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700"}`}>{l}</button>
            ))}
          </div>
          <h2 className="font-display text-2xl font-semibold mb-1">{tab === "login" ? "Welkom terug." : "Account aanmaken."}</h2>
          <p className="text-sm text-slate-500 mb-6">{tab === "login" ? "Log in om jouw portaal te bekijken." : "Na registratie keurt Merkanic je account goed."}</p>
          {tab === "login" ? <LoginForm /> : <RegisterForm />}
        </div>
      </div>
    </div>
  );
}
