import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, fmtDateTime, ROLE_LABELS } from "@/lib/api";

export const Comments = ({ o, setO }) => {
  const { isStaff } = useAuth();
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    try { const { data } = await api.post(`/workorders/${o.id}/comments`, { text, internal }); setO(data); setText(""); setInternal(false); toast.success("Opmerking geplaatst"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="bg-white border border-slate-200 p-6" data-testid="workorder-comments">
      <h3 className="font-display font-semibold mb-4">Opmerkingen</h3>
      <div className="space-y-4 mb-5">
        {o.comments.length === 0 && <p className="text-sm text-slate-500">Nog geen opmerkingen.</p>}
        {o.comments.map((c) => (
          <div key={c.id} data-testid="comment-item" className={`border-l-2 pl-4 ${c.internal ? "border-amber-400" : "border-[#C0474A]"}`}>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              {c.author_name} · {ROLE_LABELS[c.author_role]} · {fmtDateTime(c.at)}
              {c.internal && <span className="inline-flex items-center gap-1 text-amber-700"><Lock className="h-3 w-3" />intern</span>}
            </div>
            <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.text}</p>
          </div>
        ))}
      </div>
      <Textarea data-testid="comment-input" rows={3} className="rounded-none" placeholder="Schrijf een opmerking…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center justify-between mt-3">
        {isStaff ? (
          <label className="flex items-center gap-2 text-sm text-slate-600"><Switch data-testid="comment-internal-switch" checked={internal} onCheckedChange={setInternal} />Intern</label>
        ) : <span />}
        <Button data-testid="werkorder-add-note-button" onClick={send} className="rounded-none bg-slate-900 hover:bg-[#C0474A]">Plaatsen</Button>
      </div>
    </div>
  );
};
