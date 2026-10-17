import axios from "axios";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`, withCredentials: true });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("mk_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Er ging iets mis.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.msg || String(d);
}

export const STATUSES = ["Gepland", "In behandeling", "Wacht op onderdelen", "Gereed", "Afgehaald"];
export const ROLE_LABELS = { klant: "Klant", monteur: "Monteur", beheerder: "Beheerder" };
export const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" }) : "-");
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");
export const fmtKm = (n) => (n == null ? "-" : `${Number(n).toLocaleString("nl-NL")} km`);
