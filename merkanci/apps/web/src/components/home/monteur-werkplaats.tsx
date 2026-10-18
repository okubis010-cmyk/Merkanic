import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Plus, Trash2, Wrench } from 'lucide-react';
import { OrderControls } from '@/components/home/order-controls';
import { WorkChecklist, WorkOrderForm } from '@/components/home/work-order-form';
import { date, type Entry } from '@/lib/portal-types';

type Props = {
  fileToken?: string;
  onNoteSaved?: (id: string, remarks: string) => void;
  initiallyOpen?: number;
  orders: Entry[];
  vehicles: Entry[];
  photos: Entry[];
  userId: string;
  uploadingPhoto: string | null;
  onUpdate: (order: Entry, changes: Record<string, unknown>) => void;
  onUploadPhoto: (
    event: React.ChangeEvent<HTMLInputElement>,
    orderId: string,
  ) => void;
  onCreated: (order: Entry) => void;
  onNotice: (message: string) => void;
  /** Wordt doorgegeven aan het formulier: een nieuw aangemaakt voertuig. */
  onVehicleCreated?: (vehicle: Entry) => void;
  /** Verwijdert een werkorder (mag bij de monteur alleen als status Gepland is). */
  onDelete: (order: Entry) => void;
};

/**
 * Werkplaats voor de monteur: alleen de eigen werkorders, per auto een balk
 * "Begin aan werkzaamheden" die geel wordt en de werkorder opent, plus een
 * knop om zelf een nieuwe werkorder aan te maken. Eigen werkorders die nog
 * niet zijn begonnen (Gepland) kunnen worden verwijderd; gereedgemelde
 * orders zijn vergrendeld tot een beheerder ze terugzet.
 */
export function MonteurWerkplaats({
  fileToken,
  onNoteSaved,
  initiallyOpen,
  orders,
  vehicles,
  photos,
  userId,
  uploadingPhoto,
  onUpdate,
  onUploadPhoto,
  onCreated,
  onNotice,
  onVehicleCreated,
  onDelete,
}: Props) {
  const [openOrder, setOpenOrder] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => { if (initiallyOpen) setFormOpen(true); }, [initiallyOpen]);

  const beginWork = async (order: Entry) => {
    setOpenOrder((current) => (current === order.id ? '' : order.id));
    if (order.status === 'Gepland') await onUpdate(order, { status: 'Bezig' });
  };

  return (
    <>
      <div className="workshop-head">
        <h4>
          Werkplaats <span>{orders.length}</span>
        </h4>
        <button
          type="button"
          className="new-order-button"
          onClick={() => setFormOpen((current) => !current)}
        >
          <Plus size={16} /> Maak werkorder
        </button>
      </div>
      {formOpen && (
        <WorkOrderForm
          vehicles={vehicles}
          defaultMechanic={userId}
          onCreated={(order) => {
            onCreated(order);
            setOpenOrder(order.id);
            setFormOpen(false);
          }}
          onNotice={onNotice}
          onVehicleCreated={onVehicleCreated}
        />
      )}
      {orders.length ? (
        <div className="order-list">
          {orders.map((order) => {
            const vehicle =
              order.expand?.vehicle || vehicles.find((v) => v.id === order.vehicle);
            const deletable =
              order.status === 'Gepland' && (order.mechanic || '') === userId;
            return (
              <article className="order-item" key={order.id}>
                <div className="order-title">
                  <div>
                    <span className="small-label">
                      {vehicle?.plate || 'AUTO'}
                      {vehicle?.make ? ` · ${vehicle.make} ${vehicle.model || ''}` : ''}
                    </span>
                    <h5>{order.description}</h5>
                  </div>
                  <span className="status-badge">{order.status || 'Gepland'}</span>
                </div>
                <div className="order-details">
                  {typeof order.mileage === 'number' && order.mileage > 0 && (
                    <span>
                      <Wrench size={15} /> {order.mileage.toLocaleString('nl-NL')} km
                    </span>
                  )}
                  <span>
                    <CalendarDays size={15} /> {date(order.arrival)}
                  </span>
                  <span>
                    <MapPin size={15} /> Onderdelen:{' '}
                    {order.parts_arrived
                      ? `binnen${order.parts_location ? ` · ${order.parts_location}` : ''}`
                      : 'nog niet binnen'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`begin-bar${order.status === 'Bezig' ? ' busy' : order.status === 'Gereed' ? ' done' : ''}`}
                  onClick={() => void beginWork(order)}
                >
                  {order.status === 'Gepland'
                    ? '▶ BEGIN AAN WERKZAAMHEDEN'
                    : order.status === 'Bezig'
                      ? openOrder === order.id
                        ? 'WERKORDER OPEN — TIK OM TE SLUITEN'
                        : 'WERKZAAMHEDEN BEZIG — TIK OM TE OPENEN'
                      : 'WERKZAAMHEDEN GEREED'}
                </button>
                {openOrder === order.id && (
                  <div className="order-detail">
                    <p className="order-detail-task">
                      <strong>Wat moet er gebeuren:</strong> {order.description}
                    </p>
                    {order.remarks ? (
                      <p className="order-detail-task">{order.remarks}</p>
                    ) : null}
                    <WorkChecklist order={order} editable={order.status !== 'Gereed'} onUpdate={onUpdate} />
                    <OrderControls fileToken={fileToken} onNoteSaved={onNoteSaved}
                      order={order}
                      photos={photos}
                      uploading={uploadingPhoto}
                      onUpdate={onUpdate}
                      onUploadPhoto={onUploadPhoto}
                      role="monteur"
                      userId={userId}
                      onNotice={onNotice}
                    />
                    {deletable && (
                      <button
                        type="button"
                        className="delete-order-button"
                        onClick={() => void onDelete(order)}
                      >
                        <Trash2 size={15} /> Werkorder verwijderen
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">
          Er staan nog geen werkorders voor jou klaar. Maak zelf een werkorder aan
          met de knop ‘Maak werkorder’.
        </p>
      )}
    </>
  );
}
