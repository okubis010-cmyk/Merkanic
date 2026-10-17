import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, fmtDate, ROLE_LABELS } from "@/lib/api";

const STATUS_LABEL = { pending: "Wacht op goedkeuring", active: "Actief", rejected: "Afgewezen" };

const PendingCard = ({ u, patch }) => {
  const [role, setRole] = useState("monteur");
  return (
    <div data-testid={`pending-user-${u.email}`} className="bg-white border border-amber-300 p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1"><div className="font-semibold">{u.name}</div><div className="text-sm text-slate-500">{u.email} · {u.phone || "geen telefoon"} · {fmtDate(u.created_at)}</div></div>
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger data-testid={`pending-role-select-${u.email}`} className="rounded-none md:w-40"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(ROLE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button data-testid={`approve-user-button-${u.email}`} onClick={() => patch(u.id, { role, status: "active" })} className="rounded-none bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4 mr-1" />Goedkeuren</Button>
        <Button data-testid={`reject-user-button-${u.email}`} variant="outline" onClick={() => patch(u.id, { status: "rejected" })} className="rounded-none"><X className="h-4 w-4 mr-1" />Afwijzen</Button>
      </div>
    </div>
  );
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);
  const patch = async (id, body) => {
    try { await api.patch(`/users/${id}`, body); toast.success("Gebruiker bijgewerkt"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const pending = users.filter((u) => u.status === "pending");
  const rest = users.filter((u) => u.status !== "pending");
  return (
    <div>
      <PageHeader eyebrow="04 / Gebruikers" title="Gebruikersbeheer." accent="Wie mag wat." />
      <h2 className="font-display text-lg font-semibold mb-3">Wachten op goedkeuring ({pending.length})</h2>
      <div className="space-y-3 mb-10">
        {pending.length === 0 && <div className="text-sm text-slate-500 border border-dashed border-slate-300 bg-white p-6">Geen openstaande registraties. Nieuwe aanmeldingen komen ook per e-mail binnen.</div>}
        {pending.map((u) => <PendingCard key={u.id} u={u} patch={patch} />)}
      </div>
      <h2 className="font-display text-lg font-semibold mb-3">Alle gebruikers</h2>
      <div className="bg-white border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]" data-testid="users-table">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200"><th className="p-4">Naam</th><th className="p-4">E-mail</th><th className="p-4">Status</th><th className="p-4">Rol</th><th className="p-4" /></tr></thead>
          <tbody>
            {rest.map((u) => (
              <tr key={u.id} className="border-b border-slate-100" data-testid={`user-row-${u.email}`}>
                <td className="p-4 font-medium">{u.name}</td><td className="p-4 text-slate-500">{u.email}</td>
                <td className="p-4">{STATUS_LABEL[u.status]}</td>
                <td className="p-4">
                  <Select value={u.role || ""} disabled={u.id === user.id} onValueChange={(r) => patch(u.id, { role: r })}>
                    <SelectTrigger data-testid={`user-role-select-${u.email}`} className="rounded-none w-36"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>{Object.entries(ROLE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-4 text-right">
                  {u.id !== user.id && (u.status === "active"
                    ? <Button data-testid={`deactivate-user-${u.email}`} variant="ghost" size="sm" onClick={() => patch(u.id, { status: "rejected" })}>Blokkeren</Button>
                    : <Button data-testid={`activate-user-${u.email}`} variant="ghost" size="sm" disabled={!u.role} onClick={() => patch(u.id, { status: "active" })}>Activeren</Button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
