import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, fmtDateTime } from "@/lib/api";

const Thumb = ({ oid, p, onOpen }) => {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    api.get(`/workorders/${oid}/photos/${p.id}`, { responseType: "blob" })
      .then((r) => { url = URL.createObjectURL(r.data); setSrc(url); })
      .catch(() => setSrc("error"));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [oid, p.id]);
  return (
    <button type="button" data-testid={`photo-thumb-${p.id}`} onClick={() => src && src !== "error" && onOpen({ ...p, src })}
      className="group relative aspect-square overflow-hidden border border-slate-200 bg-slate-100">
      {src && src !== "error" && <img src={src} alt={p.caption || "Werkfoto"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
      {!src && <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-slate-400" />}
      {src === "error" && <span className="absolute inset-0 grid place-items-center text-xs text-slate-400">Niet geladen</span>}
      {p.caption && <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-2 py-1 text-left text-[11px] text-white truncate">{p.caption}</span>}
    </button>
  );
};

const Uploader = ({ o, setO }) => {
  const ref = useRef(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("caption", caption);
      try { const { data } = await api.post(`/workorders/${o.id}/photos`, fd); setO(data); } catch (e) { toast.error(errMsg(e)); }
    }
    setCaption(""); setBusy(false); ref.current.value = "";
    toast.success("Foto('s) toegevoegd");
  };
  return (
    <div className="flex flex-col sm:flex-row gap-2 mt-4">
      <Input data-testid="photo-caption-input" className="rounded-none" placeholder="Bijschrift (optioneel), bv. remblokken versleten" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <input ref={ref} data-testid="photo-file-input" type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload([...e.target.files])} />
      <Button type="button" data-testid="photo-upload-button" disabled={busy} onClick={() => ref.current.click()} className="rounded-none bg-slate-900 hover:bg-[#C0474A]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}Foto uploaden
      </Button>
    </div>
  );
};

export const Photos = ({ o, setO }) => {
  const { isStaff } = useAuth();
  const [open, setOpen] = useState(null);
  const remove = async () => {
    if (!window.confirm("Foto verwijderen?")) return;
    try { const { data } = await api.delete(`/workorders/${o.id}/photos/${open.id}`); setO(data); setOpen(null); toast.success("Foto verwijderd"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="bg-white border border-slate-200 p-6" data-testid="workorder-photos">
      <h3 className="font-display font-semibold mb-4">Werkfoto's <span className="text-slate-400 font-normal text-sm">({o.photos.length})</span></h3>
      {o.photos.length === 0 && <p className="text-sm text-slate-500">Nog geen foto's.</p>}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {o.photos.map((p) => <Thumb key={p.id} oid={o.id} p={p} onOpen={setOpen} />)}
      </div>
      {isStaff && <Uploader o={o} setO={setO} />}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="rounded-none max-w-3xl p-3" data-testid="photo-lightbox">
          <DialogTitle className="sr-only">Werkfoto</DialogTitle>
          {open && <img src={open.src} alt={open.caption || "Werkfoto"} className="w-full max-h-[75vh] object-contain bg-slate-900" />}
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="text-sm"><div>{open?.caption}</div><div className="text-xs text-slate-400">{open?.by} · {fmtDateTime(open?.at)}</div></div>
            {isStaff && <Button data-testid="photo-delete-button" variant="outline" size="sm" className="rounded-none text-[#C0474A]" onClick={remove}><Trash2 className="h-4 w-4 mr-1" />Verwijderen</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
