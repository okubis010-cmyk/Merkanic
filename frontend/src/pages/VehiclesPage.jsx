import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Folder, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { Plate } from "@/components/Plate";
import { useAuth } from "@/context/AuthContext";
import { api, fmtDate, fmtKm } from "@/lib/api";

const FolderCard = ({ v, i }) => (
  <Link to={`/portaal/voertuigen/${v.kenteken}`} data-testid={`vehicle-folder-card-${v.kenteken}`} style={{ animationDelay: `${i * 30}ms` }}
    className="group relative bg-white border border-slate-200 p-5 pt-6 hover:border-slate-900 hover:-translate-y-0.5 transition-[transform,border-color] fade-up">
    <div className="absolute -top-px left-5 h-1.5 w-16 bg-[#C0474A] group-hover:w-24 transition-[width]" />
    <div className="flex items-start justify-between gap-3">
      <Plate kenteken={v.kenteken} />
      <Folder className="h-5 w-5 text-slate-300 group-hover:text-[#C0474A] transition-colors" />
    </div>
    <div className="mt-4 font-display font-semibold text-lg truncate">{v.merk || "Onbekend"} {v.model}</div>
    <div className="text-sm text-slate-500 truncate">{v.owner_name || "Geen eigenaar"} · {v.bouwjaar || "-"}</div>
    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 text-xs">
      <div><div className="text-slate-400">Orders</div><div className="font-semibold text-sm" data-testid={`vehicle-order-count-${v.kenteken}`}>{v.order_count}</div></div>
      <div><div className="text-slate-400">Open</div><div className={`font-semibold text-sm ${v.open_count ? "text-[#C0474A]" : ""}`}>{v.open_count}</div></div>
      <div><div className="text-slate-400">Km</div><div className="font-semibold text-sm truncate">{fmtKm(v.last_km)}</div></div>
    </div>
    <div className="mt-2 text-xs text-slate-400">Laatste order: {fmtDate(v.last_order_at)}</div>
  </Link>
);

export default function VehiclesPage() {
  const { isStaff } = useAuth();
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/vehicles", { params: { q } }).then((r) => setList(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <PageHeader eyebrow={isStaff ? "02 / Voertuigen" : "01 / Mijn auto's"} title={isStaff ? "Mappen per kenteken." : "Mijn auto's."} accent={isStaff ? "" : "Alles van jouw auto."}>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input data-testid="vehicle-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek kenteken, merk, eigenaar…" className="pl-9 rounded-none bg-white" />
        </div>
      </PageHeader>
      {list === null && <div className="text-slate-500">Laden…</div>}
      {list?.length === 0 && (
        <div data-testid="vehicle-empty" className="border border-dashed border-slate-300 bg-white p-10 text-slate-500 text-sm">
          {isStaff ? "Nog geen voertuigen. Maak een werkorder aan — de map voor het kenteken wordt automatisch aangemaakt." : "Er zijn nog geen auto's gekoppeld aan je account. Neem contact op met Merkanic om jouw auto te laten toevoegen."}
        </div>
      )}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {list?.map((v, i) => <FolderCard key={v.kenteken} v={v} i={i} />)}
      </div>
    </div>
  );
}
