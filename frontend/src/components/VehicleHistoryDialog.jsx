import { useEffect, useState } from "react";
import { History, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { api, fmtDate, fmtDateTime, fmtKm } from "@/lib/api";

export const VehicleHistoryDialog = ({ kenteken, open, onOpenChange }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (open && kenteken) {
      setData(null);
      api.get(`/vehicles/${kenteken}`).then((r) => setData(r.data)).catch(() => setData(false));
    }
  }, [open, kenteken]);
  const v = data?.vehicle;
  const openOrders = data ? data.orders.filter((o) => !["Gereed", "Afgehaald"].includes(o.status)) : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="vehicle-history-dialog">
        <DialogHeader>
          <div className="eyebrow">Bekende auto</div>
          <DialogTitle className="font-display text-2xl">Hier hebben we al aan gewerkt.</DialogTitle>
        </DialogHeader>
        {data === null && <p className="text-sm text-slate-500">Historie laden…</p>}
        {data === false && <p className="text-sm text-slate-500">Historie kon niet worden geladen.</p>}
        {data && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Plate kenteken={v.kenteken} />
              <span className="font-semibold">{v.merk} {v.model}</span>
              <span className="text-sm text-slate-500">· {v.owner_name || "geen eigenaar"} · laatste km {fmtKm(v.last_km)} · APK {v.apk_vervaldatum || "-"}</span>
            </div>
            {openOrders.length > 0 && (
              <div data-testid="history-open-orders-warning" className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Er {openOrders.length === 1 ? "staat nog 1 openstaande order" : `staan nog ${openOrders.length} openstaande orders`} voor deze auto ({openOrders.map((o) => `order ${o.volgnummer}`).join(", ")}).
              </div>
            )}
            <div>
              <h3 className="font-display font-semibold mb-2">Eerdere orders ({data.orders.length})</h3>
              <div className="border border-slate-200 divide-y divide-slate-100">
                {[...data.orders].reverse().map((o) => (
                  <a key={o.id} href={`/portaal/werkorders/${o.id}`} target="_blank" rel="noreferrer" data-testid={`history-order-${o.volgnummer}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50">
                    <span className="font-display font-bold text-slate-300 w-7">{String(o.volgnummer).padStart(2, "0")}</span>
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold block truncate">{o.title}</span>
                      <span className="text-xs text-slate-500">{fmtDate(o.created_at)} · {fmtKm(o.km_stand)} · {o.monteur_name || "geen monteur"}</span>
                    </span>
                    <StatusBadge status={o.status} />
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><History className="h-4 w-4 text-[#C0474A]" />Laatste gebeurtenissen</h3>
              <div className="relative pl-5 border-l border-slate-200 space-y-3" data-testid="history-dialog-timeline">
                {data.history.slice(0, 12).map((h, i) => (
                  <div key={`${h.at}-${i}`} className="relative text-sm">
                    <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ${h.type === "comment" ? "bg-[#C0474A]" : "bg-slate-400"}`} />
                    <div className="text-xs text-slate-400">{fmtDateTime(h.at)} · {h.by} · Order {h.volgnummer}{h.internal ? " · intern" : ""}</div>
                    <div className={h.type === "comment" ? "italic" : ""}>{h.type === "comment" ? `“${h.text}”` : h.text}</div>
                  </div>
                ))}
              </div>
            </div>
            <Button data-testid="history-dialog-continue" onClick={() => onOpenChange(false)} className="w-full rounded-none bg-[#C0474A] hover:bg-[#A8383B]">Verder met nieuwe werkorder</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
