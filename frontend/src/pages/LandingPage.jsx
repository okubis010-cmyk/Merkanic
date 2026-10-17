import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Loader2, Wrench, Camera, FileText, CalendarCheck } from "lucide-react";
import { Plate } from "@/components/Plate";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

const NavBar = () => {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#F1F5F9]/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <a href="#top" data-testid="landing-logo" className="font-display text-xl font-extrabold tracking-tight">MERKANIC<span className="text-[#C0474A]">.</span></a>
        <nav className="flex items-center gap-5 text-sm">
          <a href="#apk" data-testid="landing-nav-apk" className="hidden sm:inline text-slate-600 hover:text-slate-900">APK-check</a>
          <a href="#portaal" data-testid="landing-nav-portaal" className="hidden sm:inline text-slate-600 hover:text-slate-900">Klantenportaal</a>
          <Link to={user ? "/portaal" : "/login"} data-testid="landing-nav-login" className="bg-slate-900 text-white px-4 py-2 font-semibold hover:bg-[#C0474A] transition-colors">
            {user ? "Naar portaal" : "Inloggen"}
          </Link>
        </nav>
      </div>
    </header>
  );
};

const Hero = () => (
  <section id="top" className="relative overflow-hidden">
    <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
      <div className="fade-up">
        <div className="eyebrow mb-3">01 / Welkom bij Merkanic</div>
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-6">Jouw auto. Alles op één plek.</div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
          Goed voor je auto.<br /><span className="font-serif-accent font-medium text-[#C0474A]">Helder voor jou.</span>
        </h1>
        <p className="mt-6 max-w-xl text-slate-600 text-base">
          In het Merkanic-klantenportaal zie je facturen, de volledige onderhoudsgeschiedenis bij ons, werkfoto's, opmerkingen van de monteur, adviespunten en service-intervallen. Je plant eenvoudig een afspraak en houdt alles over je auto bij.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#portaal" data-testid="hero-portaal-button" className="inline-flex items-center gap-2 bg-[#C0474A] text-white px-6 py-3 font-semibold hover:bg-[#A8383B] transition-colors">
            Naar het klantenportaal <ArrowRight className="h-4 w-4" />
          </a>
          <a href="#apk" data-testid="hero-apk-button" className="inline-flex items-center gap-2 border border-slate-300 px-6 py-3 font-semibold hover:border-slate-900 transition-colors">APK-datum checken</a>
        </div>
      </div>
      <div className="relative fade-up" style={{ animationDelay: "120ms" }}>
        <div className="aspect-[4/5] overflow-hidden border border-slate-200 bg-slate-200">
          <img src="https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000" alt="Monteur aan het werk" className="h-full w-full object-cover" />
        </div>
        <div className="absolute -bottom-5 -left-5 bg-white border border-slate-200 px-5 py-4 shadow-sm">
          <div className="eyebrow !text-slate-400 mb-1">M / 01</div>
          <div className="font-display font-semibold">Slimme service voor elke kilometer</div>
        </div>
      </div>
    </div>
  </section>
);

const ApkCheck = () => {
  const [k, setK] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const check = async (e) => {
    e.preventDefault();
    if (!k.trim()) return;
    setBusy(true); setErr(""); setRes(null);
    try { const { data } = await api.get(`/public/apk/${k.replace(/[^A-Za-z0-9]/g, "")}`); setRes(data); } catch (x) { setErr(errMsg(x)); }
    setBusy(false);
  };
  return (
    <section id="apk" className="bg-white border-y border-slate-200">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="eyebrow mb-3">02 / Kentekencheck</div>
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-4">Direct inzicht</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Wanneer moet jouw auto <span className="font-serif-accent font-medium text-[#C0474A]">weer naar de APK?</span></h2>
          <p className="mt-4 text-slate-600">Voer je kenteken in en bekijk de vervaldatum rechtstreeks uit de openbare RDW-gegevens.</p>
        </div>
        <form onSubmit={check} className="border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8">
          <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3"><span>Jouw kenteken</span><span>01 — 02</span></div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex flex-1 items-stretch border-2 border-slate-900 bg-[#FACC15] rounded-[5px] overflow-hidden">
              <span className="bg-[#1D4ED8] text-white text-xs font-bold px-2 flex items-end pb-2">NL</span>
              <input data-testid="apk-kenteken-input" value={k} onChange={(e) => setK(e.target.value.toUpperCase())} placeholder="AB-123-C"
                className="flex-1 min-w-0 bg-transparent px-3 py-3 font-plate font-extrabold text-xl tracking-widest outline-none placeholder:text-slate-900/30" />
            </div>
            <button data-testid="apk-check-button" disabled={busy} className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3 font-semibold hover:bg-[#C0474A] transition-colors">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Bekijk APK-datum
            </button>
          </div>
          {err && <p data-testid="apk-error" className="mt-4 text-sm text-[#C0474A]">{err}</p>}
          {res && (
            <div data-testid="apk-result" className="mt-5 border border-slate-200 bg-white p-5 fade-up">
              <div className="flex items-center gap-3 flex-wrap"><Plate kenteken={res.kenteken} /><span className="font-semibold">{res.merk} {res.model}</span></div>
              <div className="mt-3 text-sm text-slate-500">APK geldig tot</div>
              <div data-testid="apk-result-date" className="font-display text-2xl font-bold">{res.apk_vervaldatum || "Onbekend"}</div>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">Gegevens afkomstig van de RDW</p>
        </form>
      </div>
    </section>
  );
};

const FEATURES = [
  { Icon: Wrench, t: "Onderhoud & intervallen", d: "Geschiedenis bij Merkanic, adviespunten en wanneer de volgende beurt nodig is." },
  { Icon: Camera, t: "Foto’s & opmerkingen", d: "Werkfoto’s en monteur-notities bij elke klus, helder terug te lezen." },
  { Icon: FileText, t: "Facturen & afspraken", d: "Facturen openen en direct een afspraak inplannen in het portaal." },
];

const Portaal = () => {
  const { user } = useAuth();
  return (
    <section id="portaal" className="mx-auto max-w-7xl px-5 sm:px-8 py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
        <div>
          <div className="eyebrow mb-3">03 / Klantenportaal</div>
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-4">Inloggen · Auto & service</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Klantenportaal. <span className="font-serif-accent font-medium text-[#C0474A]">Alles van jouw auto.</span></h2>
        </div>
        <p className="text-slate-600 lg:pt-10">Log in om facturen te openen, onderhoudsgeschiedenis en foto's te bekijken, opmerkingen en adviespunten te lezen, intervallen te volgen en een afspraak te maken. Monteurs zien hier de werkplaats in één overzicht.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {FEATURES.map(({ Icon, t, d }) => (
          <div key={t} className="bg-white border border-slate-200 p-6 hover:-translate-y-0.5 hover:border-slate-900 transition-[transform,border-color]">
            <Icon className="h-5 w-5 text-[#C0474A] mb-4" />
            <div className="font-display font-semibold text-lg">{t}</div>
            <p className="text-sm text-slate-600 mt-1">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 bg-slate-900 text-white p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <CalendarCheck className="h-6 w-6 text-[#f08b8d] mb-3" />
          <div className="font-display text-2xl font-semibold">{user ? `Welkom terug, ${user.name}.` : "Welkom terug."}</div>
          <p className="text-slate-300 text-sm mt-1">Log in om jouw portaal te bekijken, of registreer een nieuw account.</p>
        </div>
        <div className="flex gap-3">
          <Link to={user ? "/portaal" : "/login"} data-testid="portaal-login-button" className="bg-[#C0474A] px-6 py-3 font-semibold hover:bg-[#A8383B] transition-colors">{user ? "Naar portaal" : "Inloggen"}</Link>
          {!user && <Link to="/login?tab=register" data-testid="portaal-register-button" className="border border-slate-600 px-6 py-3 font-semibold hover:border-white transition-colors">Registreren</Link>}
        </div>
      </div>
    </section>
  );
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F1F5F9]" data-testid="landing-page">
      <NavBar />
      <Hero />
      <ApkCheck />
      <Portaal />
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row justify-between gap-2 text-sm text-slate-500">
          <span>Facturen, onderhoud, foto's en afspraken — helder in je portaal.</span>
          <span>© {new Date().getFullYear()} Merkanic · <a href="mailto:info@merkanic.nl" className="hover:text-[#C0474A]">info@merkanic.nl</a></span>
        </div>
      </footer>
    </div>
  );
}
