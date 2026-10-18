import { useState } from 'react';
import { Camera, Package } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Entry } from '@/lib/portal-types';

type Props = {
  fileToken?: string;
  onNoteSaved?: (id: string, remarks: string) => void;
  order: Entry;
  photos: Entry[];
  uploading: string | null;
  onUpdate: (order: Entry, changes: Record<string, unknown>) => void;
  onUploadPhoto: (
    event: React.ChangeEvent<HTMLInputElement>,
    orderId: string,
  ) => void;
  /** Only for the beheerder: assign a monteur to the order. */
  mechanics?: Entry[];
  /** Rol van de ingelogde gebruiker: monteurs kunnen een gereedde order niet wijzigen. */
  role?: string;
  /** Id van de ingelogde gebruiker (voor de onderdelenbestelling). */
  userId?: string;
  onNotice?: (message: string) => void;
};

/** Status, aanwezigheid, onderdelen, monteur, foto-upload en
 *  onderdelen bestellen bij één werkorder. */
export function OrderControls({
  fileToken,
  onNoteSaved,
  order,
  photos,
  uploading,
  onUpdate,
  onUploadPhoto,
  mechanics,
  role,
  userId,
  onNotice,
}: Props) {
  const [workNote, setWorkNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const saveWorkNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workNote.trim()) return;
    setSavingNote(true); setNoteError('');
    try {
      const result = await pb.send<{ id: string; remarks: string }>('/api/merkanic/work-orders/' + encodeURIComponent(order.id) + '/notes', { method: 'POST', body: { note: workNote.trim() } });
      onNoteSaved?.(result.id, result.remarks); setWorkNote(''); onNotice?.('Opmerking opgeslagen bij de werkorder.');
    } catch { setNoteError('Opmerking opslaan is niet gelukt. Probeer het opnieuw.'); }
    finally { setSavingNote(false); }
  };
  const [partsOpen, setPartsOpen] = useState(false);
  const [part, setPart] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [ordering, setOrdering] = useState(false);

  const orderPhotos = fileToken ? photos.filter((p) => p.work_order === order.id) : [];
  // Een monteur kan een gereedgemelde werkorder niet meer wijzigen; de
  // beheerder kan de status wel terugzetten en dan weer alles aanpassen.
  const locked = role === 'monteur' && order.status === 'Gereed';
  const canOrderParts = (role === 'monteur' || role === 'beheerder') && !locked;

  const orderParts = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || !part.trim()) return;
    setOrdering(true);
    try {
      await pb.collection('parts_orders').create({
        owner: userId,
        work_order: order.id,
        part: part.trim(),
        quantity: Number(quantity) || 1,
        note: note.trim(),
      });
      setPart('');
      setQuantity('1');
      setNote('');
      setPartsOpen(false);
      onNotice?.(
        `Bestelling verzonden naar info@merkanic.nl (${part.trim()} × ${Number(quantity) || 1}).`,
      );
    } catch {
      onNotice?.('Onderdelen bestellen is niet gelukt. Probeer het opnieuw.');
    } finally {
      setOrdering(false);
    }
  };

  if (locked) {
    return (
      <>
        <p className="locked-note">
          Deze werkorder is gereed en kan niet meer worden gewijzigd. Een beheerder
          kan hem weer op ‘Bezig’ zetten, daarna kun je verder werken.
        </p>
        {orderPhotos.length ? (
          <div className="photo-list">
            {orderPhotos.map((p) => (
              <a
                key={p.id}
                href={pb.files.getURL(p, p.image!, { token: fileToken })}
                target="_blank"
                rel="noreferrer"
              >
                {p.caption || 'Werkfoto'} bekijken ↗
              </a>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <form className="mk-note-form" onSubmit={saveWorkNote}>
        <label>Opmerking toevoegen<textarea value={workNote} onChange={e => setWorkNote(e.target.value)} maxLength={4000} required placeholder="Leg vast wat je tijdens de werkzaamheden hebt gezien of gedaan." /></label>
        {noteError && <p role="alert" className="form-error">{noteError}</p>}
        <button className="new-order-button" disabled={savingNote || !workNote.trim()}>{savingNote ? 'Opslaan…' : 'Opmerking opslaan'}</button>
      </form>
      <div className="order-actions">
        <label>
          Status{' '}
          <select
            value={order.status || 'Gepland'}
            onChange={(e) => void onUpdate(order, { status: e.target.value })}
          >
            <option>Gepland</option>
            <option>Bezig</option>
            <option>Gereed</option>
          </select>
        </label>
        {mechanics && (
          <label>
            Monteur{' '}
            <select
              value={order.mechanic || ''}
              onChange={(e) => {
                if (e.target.value !== (order.mechanic || ''))
                  void onUpdate(order, { mechanic: e.target.value });
              }}
            >
              <option value="">Nog niet toegewezen</option>
              {mechanics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-check">
          <input
            type="checkbox"
            checked={!!order.car_present}
            onChange={(e) => void onUpdate(order, { car_present: e.target.checked })}
          />{' '}
          Auto aanwezig
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={!!order.parts_arrived}
            onChange={(e) => void onUpdate(order, { parts_arrived: e.target.checked })}
          />{' '}
          Onderdelen binnen
        </label>
        <label>
          Locatie onderdelen{' '}
          <input
            defaultValue={order.parts_location || ''}
            key={order.id + order.parts_location}
            onBlur={(e) => {
              if (e.target.value !== (order.parts_location || ''))
                void onUpdate(order, { parts_location: e.target.value });
            }}
            placeholder="Bijv. magazijn vak A3"
          />
        </label>
        <label className="photo-upload">
          <Camera size={16} /> Foto maken / uploaden
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void onUploadPhoto(e, order.id)}
            disabled={uploading === order.id}
          />
        </label>
        {uploading === order.id && <span className="small-label">Uploaden...</span>}
        {canOrderParts && (
          <button
            type="button"
            className="new-order-button"
            onClick={() => setPartsOpen((current) => !current)}
          >
            <Package size={16} /> Onderdelen bestellen
          </button>
        )}
      </div>
      {canOrderParts && partsOpen && (
        <form onSubmit={orderParts} className="parts-form">
          <h6>Onderdeel bestellen</h6>
          <div className="appointment-fields">
            <label>
              Benodigd onderdeel
              <input
                value={part}
                onChange={(e) => setPart(e.target.value)}
                placeholder="Bijv. remblokken voor"
                required
              />
            </label>
            <label>
              Hoeveelheid
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </div>
          <label>
            Toelichting
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bijv. merk Bosch, achteras, spoed"
            />
          </label>
          <button className="submit-button" disabled={ordering}>
            {ordering ? 'Versturen...' : 'Bestellen'}
          </button>
          <p className="panel-note">De bestelling wordt per e-mail verzonden naar info@merkanic.nl.</p>
        </form>
      )}
      {orderPhotos.length ? (
        <div className="photo-list">
          {orderPhotos.map((p) => (
            <a
              key={p.id}
              href={pb.files.getURL(p, p.image!, { token: fileToken })}
              target="_blank"
              rel="noreferrer"
            >
              {p.caption || 'Werkfoto'} bekijken ↗
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
}
