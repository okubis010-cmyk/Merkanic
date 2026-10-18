import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { plateFormat, type Entry } from '@/lib/portal-types';

/** De werkbladen uit het aangeleverde Merkanic-project, plus de eerder gebruikte oliewissel. */
const FORM_TASKS: Record<string, string[]> = {
  'Kleine beurt': ['Motorolie verversen','Oliefilter vervangen','Vloeistoffen controleren en bijvullen','Bandenspanning en profiel controleren','Verlichting controleren','Ruitenwissers controleren','Remmen visueel controleren','Service-indicator resetten'],
  'Grote beurt': ['Motorolie verversen','Oliefilter vervangen','Vloeistoffen controleren en bijvullen','Bandenspanning en profiel controleren','Verlichting controleren','Ruitenwissers controleren','Remmen visueel controleren','Service-indicator resetten','Luchtfilter vervangen','Interieurfilter vervangen','Bougies controleren/vervangen','Brandstoffilter controleren','Remvloeistof testen','Distributie- en aandrijfriem controleren','Accu testen','Ophanging en stuurinrichting controleren','Uitlaatsysteem controleren','Proefrit'],
  'APK': ['Verlichting en signalering','Remtest','Banden en profieldiepte','Ophanging en stuurinrichting','Uitlaatemissie meten','Carrosserie en corrosie','Ruiten en wissers','Veiligheidsgordels','Gereedmelding RDW'],
  'Banden wissel': ['Wielen demonteren','Profiel en schade controleren','Banden monteren','Wielen balanceren','Wielmoeren aandraaien op moment','Bandenspanning instellen','TPMS resetten','Banden labelen en opslaan'],
  'Diagnose': ['Klacht van klant vastleggen','Foutcodes uitlezen','Storingsanalyse','Proefrit','Advies/offerte opstellen'],
  'Vrije werkorder': [],
  'Olie wissel': ['Motorolie verversen','Oliefilter controleren/vervangen','Service-indicator resetten'],
};
const STANDARD_FORMS = Object.keys(FORM_TASKS);
export type WorkTask = { id: string; label: string; done: boolean; form: string; note?: string };

type Props = {
  vehicles: Entry[];
  /** Only for the beheerder: list of monteurs to assign the order to. */
  mechanics?: Entry[];
  /** For a monteur: their own id, so the order is assigned to them. */
  defaultMechanic?: string;
  onCreated: (order: Entry) => void;
  onNotice: (message: string) => void;
  /** Wordt aangeroepen als er een nieuw voertuig is aangemaakt bij een vrij kenteken. */
  onVehicleCreated?: (vehicle: Entry) => void;
};

/** Leeg werkorderformulier: kenteken (vrij of uit de lijst), km-stand, openende
 *  standaardformulieren met eigen opmerkingen, een groot opmerkingenveld
 *  "Wat moet er gebeuren?" en vrije werkzaamheden. */
export function WorkOrderForm({
  vehicles,
  mechanics,
  defaultMechanic,
  onCreated,
  onNotice,
  onVehicleCreated,
}: Props) {
  const [vehicleId, setVehicleId] = useState('');
  const [plate, setPlate] = useState('');
  const [mileage, setMileage] = useState('');
  const [forms, setForms] = useState<Record<string, boolean>>({});
  const [formNotes, setFormNotes] = useState<Record<string, string>>({});
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});
  const [openForm, setOpenForm] = useState('');
  const [remarks, setRemarks] = useState('');
  const [work, setWork] = useState('');
  const [mechanic, setMechanic] = useState(defaultMechanic ?? '');
  const [saving, setSaving] = useState(false);

  const toggleForm = (name: string) => {
    const selecting = !forms[name];
    if (selecting && Object.values(forms).filter(Boolean).length >= 3) {
      onNotice('Kies maximaal drie formulieren per werkorder.');
      return;
    }
    setForms((prev) => ({ ...prev, [name]: selecting }));
    if (selecting) {
      setOpenForm(name);
    } else {
      setOpenForm((current) => (current === name ? '' : current));
      setFormNotes((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedForms = STANDARD_FORMS.filter((f) => forms[f]);
    const freeWork = work.trim();
    if (!selectedForms.length && !freeWork) {
      onNotice('Vink minstens één standaardformulier aan of beschrijf de werkzaamheden.');
      return;
    }
    const remarksText = [
      ...selectedForms
        .map((f) => (formNotes[f] || '').trim() && `${f}: ${(formNotes[f] || '').trim()}`)
        .filter(Boolean),
      remarks.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    const typedPlate = plateFormat(plate);
    let vehicle = vehicles.find((v) => v.id === vehicleId);
    if (typedPlate) {
      // Vrij ingevoerd kenteken: zoek een bestaande auto, maak anders een nieuwe aan.
      vehicle = vehicles.find((v) => plateFormat(v.plate || '') === typedPlate);
      if (!vehicle) {
        setSaving(true);
        try {
          vehicle = await pb.collection('vehicles').create<Entry>({
            owner: pb.authStore.record?.id,
            plate: typedPlate,
          });
          onVehicleCreated?.(vehicle);
        } catch {
          onNotice('Auto met dit kenteken aanmaken is niet gelukt. Probeer het opnieuw.');
          setSaving(false);
          return;
        }
      }
    }
    if (!vehicle) {
      onNotice('Voer een kenteken in of kies een auto uit de lijst.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        owner: vehicle.owner,
        vehicle: vehicle.id,
        description: [...selectedForms, freeWork].filter(Boolean).join(' · '),
        remarks: remarksText,
        status: 'Gepland',
        checklist: selectedForms.flatMap((form) => FORM_TASKS[form].map((label) => ({
          id: crypto.randomUUID(), label, done: Boolean(completedTasks[form + ':' + label]), form, note: '',
        }))),
      };
      if (mileage) payload.mileage = Number(mileage);
      if (mechanic) payload.mechanic = mechanic;
      const item = await pb
        .collection('work_orders')
        .create<Entry>(payload, { expand: 'vehicle,mechanic' });
      onCreated(item);
      onNotice('Werkorder aangemaakt.');
      setVehicleId('');
      setPlate('');
      setMileage('');
      setForms({});
      setFormNotes({});
      setCompletedTasks({});
      setOpenForm('');
      setRemarks('');
      setWork('');
    } catch {
      onNotice(
        'Werkorder aanmaken is niet gelukt. Vul alle velden in en probeer het opnieuw.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="appointment-form">
      <h5>Nieuwe werkorder</h5>
      <div className="appointment-fields">
        <label>
          Kenteken (vrij invoeren)
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="AB-123-CD"
            maxLength={12}
          />
        </label>
        <label>
          Of kies een auto
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Uit de lijst</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
                {v.make ? ` · ${v.make} ${v.model || ''}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Km-stand
          <input
            type="number"
            min="0"
            step="1"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder="Bijv. 84500"
          />
        </label>
      </div>
      <div className="field-label">Standaardformulieren — kies maximaal drie en vink de uitgevoerde taken aan</div>
      <div className="form-list">
        {STANDARD_FORMS.map((name) => (
          <div className="form-block" key={name}>
            <button
              type="button"
              className={`form-toggle${forms[name] ? ' selected' : ''}`}
              onClick={() => toggleForm(name)}
              aria-expanded={Boolean(forms[name])}
            >
              <span className="form-toggle-mark">{forms[name] ? '✓' : '+'}</span>
              {name}
              <span className="form-toggle-hint">
                {forms[name] ? (openForm === name ? ' — sluiten' : ' — openen') : ''}
              </span>
            </button>
            {forms[name] && openForm === name && (
              <div className="form-detail">
                {FORM_TASKS[name].length ? <div className="mk-template-tasks">{FORM_TASKS[name].map((task) => <label key={task} className="mk-template-task"><input type="checkbox" checked={Boolean(completedTasks[name + ':' + task])} onChange={(event) => setCompletedTasks((prev) => ({ ...prev, [name + ':' + task]: event.target.checked }))} /><span>{task}</span></label>)}</div> : <p>Voeg de werkzaamheden hieronder als vrije tekst toe.</p>}
                <label>
                  Opmerkingen — {name}
                  <textarea
                    value={formNotes[name] || ''}
                    onChange={(e) =>
                      setFormNotes((prev) => ({ ...prev, [name]: e.target.value }))
                    }
                    placeholder={`Wat moet er bij de ${name.toLowerCase()} gebeuren?`}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
      <label className="remarks-field">
        Wat moet er gebeuren? (opmerkingen)
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Groot opmerkingenveld — beschrijf uitgebreid wat er moet gebeuren"
        />
      </label>
      <label>
        Overige werkzaamheden (kort)
        <input
          value={work}
          onChange={(e) => setWork(e.target.value)}
          placeholder="Bijv. remmen controleren"
        />
      </label>
      {mechanics && (
        <label>
          Monteur
          <select value={mechanic} onChange={(e) => setMechanic(e.target.value)}>
            <option value="">Nog niet toegewezen</option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="submit-button" disabled={saving}>
        {saving ? 'Aanmaken...' : 'Werkorder aanmaken'} <ArrowRight size={17} />
      </button>
    </form>
  );
}

export function WorkChecklist({ order, editable, onUpdate }: {
  order: Entry;
  editable: boolean;
  onUpdate: (order: Entry, changes: Record<string, unknown>) => void;
}) {
  const [extra, setExtra] = useState('');
  const tasks = Array.isArray(order.checklist) ? order.checklist : [];
  if (!tasks.length && !editable) return null;
  const completed = tasks.filter((task) => task.done).length;
  const toggle = (id: string) => {
    if (!editable) return;
    onUpdate(order, { checklist: tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) });
  };
  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const label = extra.trim();
    if (!label || label.length > 200) return;
    onUpdate(order, { checklist: [...tasks, { id: crypto.randomUUID(), label, done: false, form: 'Extra werkzaamheden', note: '' }] });
    setExtra('');
  };
  return <section className="mk-checklist" aria-label="Werkorderchecklist">
    <div className="mk-checklist-head"><strong>Werkzaamheden</strong><span>{completed}/{tasks.length} afgerond</span></div>
    {tasks.length ? <ul>{tasks.map((task) => <li key={task.id}><label><input type="checkbox" checked={Boolean(task.done)} disabled={!editable} onChange={() => toggle(task.id)} /><span className={task.done ? 'done' : ''}>{task.label}</span></label><small>{task.form}</small></li>)}</ul> : <p>Nog geen taken. Voeg hieronder een taak toe.</p>}
    {editable && <form onSubmit={add}><input aria-label="Extra taak" placeholder="Extra taak toevoegen…" maxLength={200} value={extra} onChange={(event) => setExtra(event.target.value)} /><button type="submit">Toevoegen</button></form>}
  </section>;
}
