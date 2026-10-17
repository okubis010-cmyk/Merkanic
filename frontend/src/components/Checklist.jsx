import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";

export const Checklist = ({ o, setO, editable }) => {
  const [label, setLabel] = useState("");
  const done = o.checklist.filter((c) => c.done).length;
  const toggle = async (c) => {
    try { const { data } = await api.patch(`/workorders/${o.id}/checklist/${c.id}`, { done: !c.done }); setO(data); } catch (e) { toast.error(errMsg(e)); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    try { const { data } = await api.post(`/workorders/${o.id}/checklist`, { label }); setO(data); setLabel(""); } catch (x) { toast.error(errMsg(x)); }
  };
  const pct = o.checklist.length ? Math.round((done / o.checklist.length) * 100) : 0;
  return (
    <div className="bg-white border border-slate-200 p-6" data-testid="workorder-checklist">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-semibold">Werkzaamheden · {o.template_name}</h3>
        <span className="text-sm text-slate-500" data-testid="checklist-progress">{done}/{o.checklist.length}</span>
      </div>
      <div className="h-1 bg-slate-100 mb-4"><div className="h-1 bg-[#C0474A] transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
      {o.checklist.length === 0 && <p className="text-sm text-slate-500">Nog geen taken.</p>}
      <ul className="divide-y divide-slate-100">
        {o.checklist.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <Checkbox data-testid={`werkorder-checklist-item-${i}`} checked={c.done} disabled={!editable} onCheckedChange={() => toggle(c)} className="rounded-none data-[state=checked]:bg-[#C0474A] data-[state=checked]:border-[#C0474A]" />
            <span className={`text-sm ${c.done ? "line-through text-slate-400" : ""}`}>{c.label}</span>
          </li>
        ))}
      </ul>
      {editable && (
        <form onSubmit={add} className="flex gap-2 mt-4">
          <Input data-testid="checklist-add-input" className="rounded-none" placeholder="Extra taak toevoegen…" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button data-testid="checklist-add-button" variant="outline" className="rounded-none"><Plus className="h-4 w-4" /></Button>
        </form>
      )}
    </div>
  );
};
