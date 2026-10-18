import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from './+types/home';
import { seo } from '@/lib/seo';
import pb from '@/lib/pocketbase-client';
import { date, plateFormat, type Entry } from '@/lib/portal-types';
import { ArrowRight, CalendarCheck, CalendarDays, Camera, CarFront, CheckCircle2, ChevronRight, ClipboardList, FileText, FolderOpen, Loader2, LogOut, MapPin, Package, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users, Wrench, X } from 'lucide-react';
export function meta({ matches, location }: Route.MetaArgs) { return seo({ matches, location }, { title: 'Merkanic | Klantenportaal', description: 'Werkorders, voertuiggeschiedenis, facturen, foto’s en afspraken in het Merkanic-portaal.' }); }
/**
 * Session state for the signed-in PocketBase user: user, isAuthed, isLoading,
 * login, signup, logout. No provider to mount — every caller reads the same
 * `pb.authStore`.
 *
 * The JWT is persisted in localStorage, which the server cannot read, so the
 * session is filled in after hydration. Render on `isLoading` (a spinner, a
 * skeleton) instead of the signed-out state, or a signed-in visitor sees a
 * "Sign in" button flash on every page load.
 */
let sessionRefresh: Promise<unknown> | null = null;

function useAuth() {
	const [user, setUser] = useState<typeof pb.authStore.record>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
        let cancelled = false;
        const unsubscribe = pb.authStore.onChange((_token, record) => { if (!cancelled) setUser(record); });
        const validate = async () => {
            try {
                if (pb.authStore.isValid) {
                    if (!sessionRefresh) sessionRefresh = pb.collection('users').authRefresh({ requestKey: null }).finally(() => { sessionRefresh = null; });
                    await sessionRefresh;
                } else { pb.authStore.clear(); }
            } catch {
                // A cached token is not proof that the account still exists.
                pb.authStore.clear();
            } finally {
                if (!cancelled) { setUser(pb.authStore.isValid ? pb.authStore.record : null); setIsLoading(false); }
            }
        };
        void validate();
        return () => { cancelled = true; unsubscribe(); };
    }, []);

	return useMemo(
		() => ({
			user,
			isAuthed: !isLoading && Boolean(user) && pb.authStore.isValid,
			isLoading,
			login: (email: string, password: string) =>
				pb.collection('users').authWithPassword(email, password),
			signup: async (
				email: string,
				password: string,
				extraFields: Record<string, unknown> = {},
			) => {
				pb.authStore.clear();
				try {
				return await pb.collection('users').create({
					email,
					password,
					passwordConfirm: password,
                    name: String(extraFields.name || '').slice(0,120),
                    role: 'klant',
				});
				} finally {
					pb.authStore.clear();
				}
			},
			logout: () => pb.authStore.clear(),
		}),
		[user, isLoading],
	);
}




export default function HomePage() {
  const { user, isAuthed, isLoading, login, signup, logout } = useAuth();
  const [newOrderRequest, requestNewOrder] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Alle');
  const [folderId, setFolderId] = useState('');
  const [guestRequests, setGuestRequests] = useState<Entry[]>([]);
  const [users, setUsers] = useState<Entry[]>([]);
  const [reload, setReload] = useState(0);
  const [fileToken, setFileToken] = useState('');
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [authPage, setAuthPage] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  useEffect(() => { const sync = () => { const hash = window.location.hash; setPortalOpen(hash === "#portaal"); setAuthPage(hash === '#login' || hash === '#register'); if (hash === '#register') setTab('signup'); if (hash === '#login') setTab('login'); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [approvalRoles, setApprovalRoles] = useState<Record<string, string>>({});
  const [savingApproval, setSavingApproval] = useState('');
  const [busy, setBusy] = useState(false);
  const [plate, setPlate] = useState('');
  const [apk, setApk] = useState<{ plate: string; date: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [vehicles, setVehicles] = useState<Entry[]>([]);
  const [orders, setOrders] = useState<Entry[]>([]);
  const [invoices, setInvoices] = useState<Entry[]>([]);
  const [appointments, setAppointments] = useState<Entry[]>([]);
  const [photos, setPhotos] = useState<Entry[]>([]);
  const [mechanics, setMechanics] = useState<Entry[]>([]);
  const [invoiceVehicle, setInvoiceVehicle] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [section, setSection] = useState<
    'overzicht' | 'werkplaats' | 'facturen' | 'afspraken' | "foto's" | 'gebruikers'
  >('overzicht');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [reason, setReason] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isMonteur = user?.role === 'monteur';
  const isBeheerder = user?.role === 'beheerder';
  const staff = isMonteur || isBeheerder;
  const activeSection = section;
  useEffect(() => { setSection(user?.role === 'monteur' || user?.role === 'beheerder' ? 'werkplaats' : 'overzicht'); setFolderId(''); setQuery(''); }, [user?.id]);

  useEffect(() => {
    if (!user) { setFileToken(''); return; }
    let cancelled = false;
    const refresh = () => { void pb.files.getToken().then(t => { if (!cancelled) setFileToken(t); }).catch(() => { if (!cancelled) setFileToken(''); }); };
    refresh();
    const timer = window.setInterval(refresh, 90000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [user]);

  useEffect(() => {
    setVehicles([]); setOrders([]); setInvoices([]); setAppointments([]); setPhotos([]); setMechanics([]); setUsers([]); setGuestRequests([]);
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      setError('');
      try {
        // Monteurs hebben geen toegang tot facturen en afspraken — die worden niet opgehaald.
        const requests: Promise<Entry[]>[] = [
          pb.collection('vehicles').getFullList<Entry>({ sort: '-created' }),
          pb
            .collection('work_orders')
            .getFullList<Entry>({ sort: '-created', expand: 'vehicle,mechanic' }),
          pb
            .collection('photos')
            .getFullList<Entry>({ sort: '-created', expand: 'work_order' }),
        ];
        if (user.role !== 'monteur') {
          requests.push(
            pb.collection('invoices').getFullList<Entry>({ sort: '-created', expand: 'vehicle' }),
            pb
              .collection('appointments')
              .getFullList<Entry>({ sort: '-created', expand: 'vehicle' }),
          );
        }
        const [v, o, p, i = [], a = []] = await Promise.all(requests);
        if (!cancelled) {
          setVehicles(v);
          setOrders(o);
          setPhotos(p);
          setInvoices(i);
          setAppointments(a);
        }
        if (user.role === 'beheerder') {
          const monteurs = await pb
            .collection('users')
            .getFullList<Entry>({ filter: "role = 'monteur'", sort: 'name' });
          const allUsers = await pb.send<{ users: Entry[] }>('/api/merkanic/admin/users', { method: 'GET' });
          if (!cancelled) { setMechanics(monteurs); setUsers(allUsers.users.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nl'))); }
          try { const requests = await pb.collection('appointment_requests').getFullList<Entry>({sort:'-created'}); if (!cancelled) setGuestRequests(requests); } catch { if (!cancelled) setNotice('Online afspraakaanvragen laden is nog niet gelukt. De overige gegevens zijn beschikbaar.'); }
        }
      } catch {
        if (!cancelled) setError('Gegevens laden is niet gelukt. Probeer het opnieuw.');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, reload]);

  const checkPlate = async (event: React.FormEvent) => {
    event.preventDefault();
    setApk(null);
    setCheckError('');
    setChecking(true);
    try {
      const response = await fetch(
        `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${encodeURIComponent(plateFormat(plate))}&$limit=1`,
      );
      if (!response.ok) throw new Error('RDW niet bereikbaar');
      const data: { vervaldatum_apk?: string }[] = await response.json();
      if (!data.length)
        setCheckError('Kenteken niet gevonden. Controleer het kenteken en probeer opnieuw.');
      else setApk({ plate: plateFormat(plate), date: data[0].vervaldatum_apk ?? null });
    } catch {
      setCheckError('De RDW-gegevens zijn tijdelijk niet beschikbaar. Probeer het later opnieuw.');
    } finally {
      setChecking(false);
    }
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setAuthNotice('');
    setBusy(true);
    try {
      if (tab === 'signup') {
        await signup(email, password, { name });
        setPassword('');
        setRegistrationComplete(true);
        setAuthNotice('Je registratie is ontvangen en wacht op goedkeuring door Merkanic. Je kunt daarna inloggen.');
      } else {
        await login(email, password);
        window.location.hash = 'portaal';
      }
    } catch (cause: unknown) {
      setError(
        tab === 'login'
          ? (cause as {status?:number}).status === 403
            ? 'Je account wacht op goedkeuring door Merkanic.'
            : 'Inloggen mislukt. Controleer je e-mailadres en wachtwoord.'
          : 'Registreren mislukt. Controleer je gegevens of gebruik een ander e-mailadres.',
      );
    } finally {
      setBusy(false);
    }
  };

  const decideAccount = async (account: Entry, status: 'active' | 'rejected') => {
    if (!isBeheerder || account.id === user?.id || savingApproval) return;
    setSavingApproval(account.id);
    setNotice('');
    try {
      const role = approvalRoles[account.id] || 'klant';
      const updated = await pb.collection('users').update<Entry>(account.id, status === 'active' ? {role,status} : {status});
      setUsers(current => current.map(item => item.id === account.id ? updated : item));
      setNotice(status === 'active' ? 'Account goedgekeurd. Deze persoon kan nu inloggen.' : 'Aanmelding afgewezen.');
    } catch {
      setNotice('Gebruiker bijwerken is niet gelukt. Probeer het opnieuw.');
    } finally {
      setSavingApproval('');
    }
  };

  const makeAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !selectedVehicle) return;
    setSaving(true);
    setNotice('');
    try {
      const item = await pb.collection('appointments').create<Entry>({
        owner: user.id,
        vehicle: selectedVehicle,
        requested_at: new Date(requestedAt).toISOString(),
        reason,
        status: 'Aangevraagd',
      });
      setAppointments((prev) => [item, ...prev]);
      setReason('');
      setRequestedAt('');
      setNotice('Je afspraakverzoek is ontvangen. We nemen contact met je op ter bevestiging.');
    } catch {
      setNotice('Afspraak aanvragen is niet gelukt. Probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const updateOrder = async (item: Entry, changes: Record<string, unknown>) => {
    try {
      await pb.send('/api/merkanic/work-orders/' + encodeURIComponent(item.id), { method: 'PATCH', body: changes });
      const updated = await pb.collection('work_orders').getOne<Entry>(item.id, { expand: 'vehicle,mechanic' });
      setOrders((prev) => prev.map((o) => (o.id === item.id ? updated : o)));
    } catch {
      setNotice('Wijzigen is niet gelukt. Probeer het opnieuw.');
    }
  };

  const deleteOrder = async (item: Entry) => {
    try {
      await pb.collection('work_orders').delete(item.id);
      setOrders((prev) => prev.filter((o) => o.id !== item.id));
      setNotice('Werkorder verwijderd.');
    } catch {
      setNotice('Werkorder verwijderen is niet gelukt. Probeer het opnieuw.');
    }
  };

  const createInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget as HTMLFormElement;
    setSaving(true);
    setNotice('');
    try {
      const fd = new FormData(form);
      fd.append('owner', vehicles.find(v => v.id === invoiceVehicle)?.owner || user.id);
      const item = await pb.collection('invoices').create<Entry>(fd, { expand: 'vehicle' });
      setInvoices((prev) => [item, ...prev]);
      form.reset();
      setInvoiceVehicle('');
      setNotice('Factuur toegevoegd.');
    } catch {
      setNotice('Factuur uploaden is niet gelukt. Vul alle velden in en probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>, orderId: string) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type) || file.size > 15 * 1024 * 1024) { setNotice('Kies een foto (JPG, PNG, WebP of HEIC) van maximaal 15 MB.'); return; }
    setUploadingPhoto(orderId);
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('owner', user.id);
      fd.append('work_order', orderId);
      const item = await pb.collection('photos').create<Entry>(fd, { expand: 'work_order' });
      setPhotos((prev) => [item, ...prev]);
      setNotice('Foto geüpload.');
    } catch {
      setNotice('Foto uploaden is niet gelukt. Probeer het opnieuw.');
    } finally {
      setUploadingPhoto(null);
      event.target.value = '';
    }
  };

  const logo = 'https://horizons-cdn.hostinger.com/0e0951c3-f12c-4217-928b-41adbafd2c1e/514c8891f89c60c32054a1750796bea8.png';
  const vehicleFor = (o: Entry) => o.expand?.vehicle || vehicles.find(v => v.id === o.vehicle);
  const scopedVehicles = isMonteur ? vehicles.filter(v => v.owner === user?.id || orders.some(o => o.vehicle === v.id)) : vehicles;
  const matches = (value: string) => value.toLocaleLowerCase('nl').includes(query.trim().toLocaleLowerCase('nl'));
  const visibleOrders = orders.filter(o => matches(`${vehicleFor(o)?.plate || ''} ${o.description || ''} ${o.expand?.mechanic?.name || ''}`) && (statusFilter === 'Alle' || o.status === statusFilter));
  const visibleVehicles = scopedVehicles.filter(v => matches(`${v.plate || ''} ${v.make || ''} ${v.model || ''}`));
  const folder = scopedVehicles.find(v => v.id === folderId);
  const folderOrders = folder ? orders.filter(o => o.vehicle === folder.id) : [];
  const folderPhotos = folder ? photos.filter(p => folderOrders.some(o => o.id === p.work_order)) : [];
  const fileUrl = (record: Entry, name?: string, thumb?: string) => name && fileToken ? pb.files.getURL(record, name, { token: fileToken, ...(thumb ? { thumb } : {}) }) : undefined;
  const noteSaved = (id: string, remarks: string) => setOrders(prev => prev.map(o => o.id === id ? { ...o, remarks } : o));
  const openSection = (next: typeof section) => { setSection(next); setFolderId(''); setQuery(''); setNotice(''); };
  const setAppointmentStatus = async (item: Entry, status: string) => {
    setSaving(true);
    try {
      const updated = await pb.collection('appointments').update<Entry>(item.id, { status }, { expand: 'vehicle' });
      setAppointments(prev => prev.map(a => a.id === item.id ? updated : a));
      setNotice('Afspraakstatus opgeslagen.');
    } catch { setNotice('Afspraakstatus opslaan is niet gelukt.'); }
    finally { setSaving(false); }
  };
  const photoGrid = (items: Entry[]) => <div className="mk-photo-grid">{items.map(p => <article key={p.id}>
    {fileUrl(p, p.image) ? <a href={fileUrl(p, p.image)} target="_blank" rel="noreferrer"><img loading="lazy" src={fileUrl(p, p.image, '400x300')} alt={p.caption || 'Werkfoto'} /></a> : <span>Beveiligde foto laden…</span>}
    <p>{p.caption || date(p.created)}</p>
  </article>)}</div>;
  const readOrder = (o: Entry) => <article className="order-item" key={o.id}>
    <div className="order-title"><div><span className="mini-plate">{vehicleFor(o)?.plate || 'AUTO'}</span><h5>{o.description || 'Werkorder'}</h5></div><span className={`mk-status mk-status-${o.status === 'Gereed' ? 'done' : o.status === 'Bezig' ? 'busy' : 'planned'}`}>{o.status || 'Gepland'}</span></div>
    <div className="order-details"><span><CalendarDays size={15} /> {date(o.arrival || o.created)}</span>{o.mileage ? <span>{o.mileage.toLocaleString('nl-NL')} km</span> : null}<span><Wrench size={15} /> {o.expand?.mechanic?.name || 'Monteur nog niet toegewezen'}</span></div>
    {o.remarks && <p className="mk-preserve">{o.remarks}</p>}
    <WorkChecklist order={o} editable={isBeheerder && o.status !== 'Gereed'} onUpdate={updateOrder} />
    {isBeheerder && <OrderControls order={o} photos={photos} uploading={uploadingPhoto} onUpdate={updateOrder} onUploadPhoto={uploadPhoto} mechanics={mechanics} role="beheerder" userId={user?.id} onNotice={setNotice} fileToken={fileToken} onNoteSaved={noteSaved} />}
    {!staff && photos.some(p => p.work_order === o.id) && photoGrid(photos.filter(p => p.work_order === o.id))}
  </article>;

  if (isAuthed && user && portalOpen) return (
    <div className="mk-app">
      <aside className="mk-sidebar">
        <a href="/" className="mk-brand"><img src={logo} alt="Merkanic" /><span>Werkplaats & klantenportaal</span></a>
        <div className="mk-spotify">
          <iframe
            title="Merkanic Spotify-afspeellijst"
            src="https://open.spotify.com/embed/playlist/3nqUzImwyGxtp9MGY4mlYl?utm_source=generator"
            width="100%"
            height="352"
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
          <a className="mk-spotify-link" href="https://open.spotify.com/playlist/3nqUzImwyGxtp9MGY4mlYl" target="_blank" rel="noopener noreferrer">Volledig luisteren in Spotify ↗</a>
        </div>
        <nav aria-label="Portaalnavigatie">
          {staff && <button className={section === 'werkplaats' ? 'active' : ''} onClick={() => openSection('werkplaats')}><ClipboardList size={18} /> Werkorders <b>{orders.length}</b></button>}
          <button className={section === 'overzicht' ? 'active' : ''} onClick={() => openSection('overzicht')}><FolderOpen size={18} /> {staff ? 'Voertuigmappen' : 'Mijn auto’s'} <b>{scopedVehicles.length}</b></button>
          {staff && <button onClick={() => { openSection('werkplaats'); if (isMonteur) requestNewOrder(n => n + 1); else setOrderFormOpen(true); }}><Plus size={18} /> Nieuwe werkorder</button>}
          {!staff && <button className={section === 'werkplaats' ? 'active' : ''} onClick={() => openSection('werkplaats')}><Wrench size={18} /> Onderhoud</button>}
          {!isMonteur && <><button className={section === 'afspraken' ? 'active' : ''} onClick={() => openSection('afspraken')}><CalendarDays size={18} /> Afspraken</button><button className={section === 'facturen' ? 'active' : ''} onClick={() => openSection('facturen')}><FileText size={18} /> Facturen</button></>}
          {isBeheerder && <><button className={section === "foto's" ? 'active' : ''} onClick={() => openSection("foto's")}><Camera size={18} /> Werkfoto’s</button><button className={section === 'gebruikers' ? 'active' : ''} onClick={() => openSection('gebruikers')}><Users size={18} /> Gebruikers</button></>}
        </nav>
        <div className="mk-profile"><strong>{user.name || user.email}</strong><small>{isBeheerder ? 'Beheerder' : isMonteur ? 'Monteur' : 'Klant'} · {user.email}</small><button onClick={logout}><LogOut size={16} /> Uitloggen</button></div>
      </aside>
      <main className="mk-main">
        <header className="mk-page-head"><div><p className="eyebrow">MERKANIC / {staff ? 'WERKPLAATS' : 'KLANTENPORTAAL'}</p><h1>{folder ? folder.plate : section === 'werkplaats' ? (staff ? 'Werkorders' : 'Onderhoudsgeschiedenis') : section === 'overzicht' ? (staff ? 'Voertuigmappen' : 'Mijn auto’s') : section === 'afspraken' ? 'Afspraken' : section === 'facturen' ? 'Facturen' : section === 'gebruikers' ? 'Gebruikers' : 'Werkfoto’s'}</h1><p>{folder ? `${folder.make || ''} ${folder.model || ''}` : 'Alle informatie over auto’s en werkzaamheden op één plek.'}</p></div><button className="mk-outline" onClick={() => setReload(n => n + 1)} disabled={loadingData}><RefreshCw size={16} /> Vernieuwen</button></header>
        {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
        {loadingData ? <div className="mk-card empty-state">Portaalgegevens worden geladen…</div> : <>
          {staff && section === 'werkplaats' && <div className="mk-stats">{['Gepland','Bezig','Gereed'].map(status => <button key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(statusFilter === status ? 'Alle' : status)}><span>{status}</span><strong>{orders.filter(o => o.status === status).length}</strong></button>)}</div>}
          {(section === 'overzicht' || section === 'werkplaats') && !folder && <div className="mk-tools"><label><Search size={17} /><input aria-label="Zoeken op kenteken of omschrijving" placeholder="Zoek op kenteken, auto of omschrijving…" value={query} onChange={e => setQuery(e.target.value)} /></label>{section === 'werkplaats' && <select aria-label="Werkorderstatus" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{['Alle','Gepland','Bezig','Gereed'].map(s => <option key={s}>{s}</option>)}</select>}</div>}
          {section === 'overzicht' && (folder ? <>
            <button className="mk-text-button" onClick={() => setFolderId('')}>← Alle voertuigen</button>
            <section className="mk-card mk-vehicle-summary"><span className="mini-plate">{folder.plate}</span><h2>{folder.make} {folder.model}</h2><p>APK vervaldatum: <strong>{date(folder.apk_date)}</strong></p><p>{folderOrders.length} werkorders · {folderPhotos.length} werkfoto’s</p></section>
            <h2 className="mk-section-title">Onderhoud & werkzaamheden</h2><div className="order-list">{folderOrders.length ? folderOrders.map(readOrder) : <p className="mk-card empty-state">Nog geen werkzaamheden geregistreerd.</p>}</div>
            {folderPhotos.length > 0 && <><h2 className="mk-section-title">Werkfoto’s</h2>{photoGrid(folderPhotos)}</>}
            {!isMonteur && invoices.some(i => i.vehicle === folder.id) && <><h2 className="mk-section-title">Facturen</h2>{invoices.filter(i => i.vehicle === folder.id).map(i => <div className="mk-card invoice-row" key={i.id}><FileText size={20} /><strong>{i.number}</strong><span>€ {Number(i.amount || 0).toFixed(2).replace('.', ',')}</span>{fileUrl(i,i.document) && <a href={fileUrl(i,i.document)} target="_blank" rel="noreferrer">Open factuur ↗</a>}</div>)}</>}
          </> : <div className="mk-vehicle-grid">{visibleVehicles.length ? visibleVehicles.map(v => <button className="mk-card mk-vehicle" key={v.id} onClick={() => setFolderId(v.id)}><div><CarFront size={27} /><ChevronRight size={18} /></div><span className="mini-plate">{v.plate}</span><h2>{`${v.make || ''} ${v.model || ''}`.trim() || 'Voertuig'}</h2><p>APK: {date(v.apk_date)}</p><small>{orders.filter(o => o.vehicle === v.id).length} werkorders · Open voertuigmap</small></button>) : <p className="mk-card empty-state">{query ? 'Geen voertuigen gevonden.' : 'Er zijn nog geen voertuigen aan dit account gekoppeld.'}</p>}</div>)}
          {section === 'werkplaats' && <div className="mk-card mk-workspace">
            {isMonteur ? <><MonteurWerkplaats orders={visibleOrders} vehicles={scopedVehicles} photos={photos} userId={user.id} uploadingPhoto={uploadingPhoto} onUpdate={updateOrder} onUploadPhoto={uploadPhoto} onCreated={item => { setOrders(prev => [item,...prev]); setOrderFormOpen(false); }} onNotice={setNotice} onVehicleCreated={v => setVehicles(prev => [v,...prev])} onDelete={deleteOrder} fileToken={fileToken} onNoteSaved={noteSaved} initiallyOpen={newOrderRequest} /></> : <>
              {isBeheerder && <><div className="workshop-head"><h2>Werkplaats</h2><button className="new-order-button" onClick={() => setOrderFormOpen(!orderFormOpen)}><Plus size={16} /> Nieuwe werkorder</button></div>{orderFormOpen && <WorkOrderForm vehicles={vehicles} mechanics={mechanics} onCreated={item => { setOrders(prev => [item,...prev]); setOrderFormOpen(false); }} onNotice={setNotice} onVehicleCreated={v => setVehicles(prev => [v,...prev])} />}</>}
              <div className="order-list">{visibleOrders.length ? visibleOrders.map(readOrder) : <p className="empty-state">Geen werkorders gevonden.</p>}</div>
            </>}
          </div>}
          {section === 'afspraken' && !isMonteur && <div className="mk-card mk-workspace">
            {isBeheerder && guestRequests.length > 0 && <section className="mk-enquiries"><h2>Nieuwe online aanvragen</h2>{guestRequests.map(a => <article className="mk-enquiry" key={a.id}><div><span className="mini-plate">{a.plate}</span><h3>{a.service} · {a.name}</h3><p>{date(a.preferred_date)} · {a.daypart}</p><p><a href={'mailto:'+a.email}>{a.email}</a>{a.phone ? <> · <a href={'tel:'+a.phone}>{a.phone}</a></> : null}</p>{a.message && <p className="mk-preserve">{a.message}</p>}</div><label>Status<select value={a.status} disabled={saving} onChange={async e => { setSaving(true); try { const updated=await pb.collection('appointment_requests').update<Entry>(a.id,{status:e.target.value}); setGuestRequests(prev=>prev.map(item=>item.id===a.id?updated:item)); setNotice('Aanvraagstatus opgeslagen.'); } catch { setNotice('Aanvraagstatus opslaan is niet gelukt.'); } finally {setSaving(false);} }}>{['Aangevraagd','Bevestigd','Afgewezen'].map(status=><option key={status}>{status}</option>)}</select></label></article>)}</section>}

            {!staff && <form className="appointment-form" onSubmit={makeAppointment}><h2>Afspraak aanvragen</h2><div className="appointment-fields"><label>Auto<select required value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}><option value="">Kies je auto</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></label><label>Gewenste datum en tijd<input required type="datetime-local" value={requestedAt} onChange={e => setRequestedAt(e.target.value)} /></label></div><label>Werkzaamheden<textarea required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} /></label><button className="submit-button" disabled={saving || !vehicles.length}>{saving ? 'Versturen…' : 'Afspraak aanvragen'}</button></form>}
            <div className="order-list">{appointments.length ? appointments.map(a => <article className="invoice-row" key={a.id}><CalendarDays size={20} /><div><strong>{a.reason}</strong><small>{a.expand?.vehicle?.plate || vehicles.find(v => v.id === a.vehicle)?.plate} · {date(a.requested_at)} {a.requested_at ? new Date(a.requested_at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}) : ''}</small></div>{isBeheerder ? <select aria-label="Afspraakstatus" disabled={saving} value={a.status} onChange={e => void setAppointmentStatus(a,e.target.value)}>{['Aangevraagd','Bevestigd','Afgewezen'].map(s => <option key={s}>{s}</option>)}</select> : <span className="status-badge">{a.status}</span>}</article>) : <p className="empty-state">Nog geen afspraken.</p>}</div>
          </div>}
          {section === 'facturen' && !isMonteur && <div className="mk-card mk-workspace">
            {isBeheerder && <form className="appointment-form" onSubmit={createInvoice}><h2>Factuur toevoegen</h2><div className="appointment-fields"><label>Auto<select required name="vehicle" value={invoiceVehicle} onChange={e => setInvoiceVehicle(e.target.value)}><option value="">Kies een auto</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.make}</option>)}</select></label><label>Factuurnummer<input required name="number" maxLength={100} /></label><label>Bedrag (€)<input name="amount" type="number" min="0" step="0.01" /></label></div><label>Bestand<input required name="document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label><button className="submit-button" disabled={saving}>{saving ? 'Uploaden…' : 'Factuur uploaden'}</button></form>}
            {invoices.length ? invoices.map(i => <article className="invoice-row" key={i.id}><FileText size={22} /><div><strong>Factuur {i.number}</strong><small>{i.expand?.vehicle?.plate} · {date(i.created)}</small></div><b>€ {Number(i.amount || 0).toFixed(2).replace('.',',')}</b>{fileUrl(i,i.document) && <a href={fileUrl(i,i.document)} target="_blank" rel="noreferrer">Bekijk factuur ↗</a>}</article>) : <p className="empty-state">Nog geen facturen.</p>}
          </div>}
          {section === "foto's" && isBeheerder && (photos.length ? photoGrid(photos) : <p className="mk-card empty-state">Nog geen werkfoto’s.</p>)}
          {section === 'gebruikers' && isBeheerder && <div className="mk-card mk-workspace">
            <h3>Wachten op goedkeuring ({users.filter(u => u.status === 'pending').length})</h3>
            <p className="mk-muted">Kies per aanmelding een functie. De persoon kan pas inloggen na jouw goedkeuring.</p>
            {users.filter(u => u.status === 'pending').length === 0 && <p>Geen openstaande registraties.</p>}
            {users.filter(u => u.status === 'pending').map(u => <div className="mk-approval-row" key={u.id}>
              <div><strong>{u.name || 'Nieuwe gebruiker'}</strong><br /><span>{u.email}</span></div>
              <select aria-label={`Functie voor ${u.name || u.email}`} value={approvalRoles[u.id] || 'klant'} onChange={event => setApprovalRoles(current => ({...current,[u.id]:event.target.value}))}>
                <option value="klant">Klant</option><option value="monteur">Monteur</option><option value="beheerder">Beheerder</option>
              </select>
              <button type="button" disabled={Boolean(savingApproval)} onClick={() => void decideAccount(u,'active')}>Goedkeuren</button>
              <button type="button" disabled={Boolean(savingApproval)} onClick={() => void decideAccount(u,'rejected')}>Afwijzen</button>
            </div>)}
            <h3>Alle gebruikers</h3>
            <div className="mk-table-wrap"><table className="mk-table"><thead><tr><th>Naam</th><th>E-mailadres</th><th>Functie</th><th>Status</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td>{u.name || '—'}</td><td>{u.email}</td><td>{u.role || '—'}</td><td>{u.status === 'active' ? 'Actief' : u.status === 'pending' ? 'Wacht op goedkeuring' : 'Afgewezen'}</td></tr>)}</tbody></table></div>
          </div>}
        </>}
        <footer className="mk-footer">© {new Date().getFullYear()} Merkanic · Werkplaats & klantenportaal</footer>
      </main>
    </div>
  );

  return <MerkanicLanding authOpen={authPage} onClose={() => { setAuthPage(false); if (["#login", "#register"].includes(window.location.hash)) window.history.replaceState(null, "", window.location.pathname); }} authContent={isLoading ? <p className="loading">Portaal wordt geladen…</p> : (            <div className="auth-card">
              <div className="auth-switch">
                <button
                  className={tab === 'login' ? 'active' : ''}
                  onClick={() => {
                    setTab('login');
                    setError('');
                    setAuthNotice('');
                  }}
                >
                  Inloggen
                </button>
                <button
                  className={tab === 'signup' ? 'active' : ''}
                  onClick={() => {
                    setTab('signup');
                    setError('');
                    setAuthNotice('');
                    setRegistrationComplete(false);
                  }}
                >
                  Registreren
                </button>
              </div>
              <h3>{tab === 'login' ? 'Welkom terug.' : 'Maak je account aan.'}</h3>
              <p>{tab === 'login' ? 'Log in om jouw portaal te bekijken.' : 'Na registratie keurt Merkanic je account goed en wijst je functie toe.'}</p>
              {tab === 'signup' && registrationComplete ? <div role="status" className="auth-notice"><strong>Wacht op goedkeuring</strong><p>{authNotice}</p></div> : <form onSubmit={submitAuth} className="stack-form">
                {tab === 'signup' && (
                  <label>
                    Naam
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jouw naam"
                      required
                    />
                  </label>
                )}
                <label>
                  E-mailadres
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="naam@voorbeeld.nl"
                    required
                  />
                </label>
                <label>
                  Wachtwoord
                  <input
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimaal 8 tekens"
                    required
                  />
                </label>
                {error && <p className="form-error">{error}</p>}
                {authNotice && <p role="status" className="auth-notice">{authNotice}</p>}
                <button className="submit-button" disabled={busy}>
                  {busy ? 'Even geduld...' : tab === 'login' ? 'Inloggen' : 'Account aanmaken'}{' '}
                  <ArrowRight size={18} />
                </button>
              </form>}
            </div>)} />;
}

const NavBar = () => {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#F1F5F9]/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <a href="#top" data-testid="landing-logo" className="font-display text-xl font-extrabold tracking-tight">MERKANIC<span className="text-[#C0474A]">.</span></a>
        <nav className="flex items-center gap-5 text-sm">
          <a href="#apk" data-testid="landing-nav-apk" className="hidden sm:inline text-slate-600 hover:text-slate-900">APK-check</a>
          <a href="#afspraak" data-testid="landing-nav-afspraak" className="hidden sm:inline text-slate-600 hover:text-slate-900">Afspraak</a>
          <a href="#portaal" data-testid="landing-nav-portaal" className="hidden sm:inline text-slate-600 hover:text-slate-900">Klantenportaal</a>
          <a href={user ? "#portaal" : "#login"} data-testid="landing-nav-login" className="bg-slate-900 text-white px-4 py-2 font-semibold hover:bg-[#C0474A] transition-colors">
            {user ? "Naar portaal" : "Inloggen"}
          </a>
        </nav>
      </div>
    </header>
  );
};

const Hero = () => (
  <section id="top" className="relative overflow-hidden">
    <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
      <div className="fade-up">
        <div className="eyebrow mb-3">01 / Welkom bij Merkanic</div>
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-6">Jouw auto. Alles op één plek.</div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
          Goed voor je auto.<br /><span className="font-serif-accent font-medium text-[#C0474A]">Helder voor jou.</span>
        </h1>
        <p className="mt-6 max-w-xl text-slate-600 text-base">
          In het Merkanic-klantenportaal zie je facturen, de volledige onderhoudsgeschiedenis bij ons, werkfoto's, opmerkingen van de monteur, adviespunten en service-intervallen. Je plant eenvoudig een afspraak en houdt alles over je auto bij.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#portaal" data-testid="hero-portaal-button" className="inline-flex items-center gap-2 bg-[#C0474A] text-white px-6 py-3 font-semibold hover:bg-[#A8383B] transition-colors">
            Naar het klantenportaal <ArrowRight className="h-4 w-4" />
          </a>
          <a href="#afspraak" data-testid="hero-afspraak-button" className="inline-flex items-center gap-2 border border-slate-300 px-6 py-3 font-semibold hover:border-slate-900 transition-colors">Afspraak maken</a>
        </div>
      </div>
      <div className="relative fade-up" style={{ animationDelay: "120ms" }}>
        <div className="aspect-[4/5] overflow-hidden border border-slate-200 bg-slate-200">
          <img src="https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000" alt="Monteur aan het werk" className="h-full w-full object-cover" />
        </div>
        <div className="absolute -bottom-5 -left-5 bg-white border border-slate-200 px-5 py-4 shadow-sm">
          <div className="eyebrow !text-slate-400 mb-1">M / 01</div>
          <div className="font-display font-semibold">Slimme service voor elke kilometer</div>
        </div>
      </div>
    </div>
  </section>
);

const ApkCheck = () => {
  const [k, setK] = useState("");
  const [res, setRes] = useState<{kenteken: string; merk: string; model: string; apk_vervaldatum: string} | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!k.trim()) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const plate = plateFormat(k);
      const response = await fetch('https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=' + encodeURIComponent(plate) + '&$limit=1', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('De RDW is tijdelijk niet bereikbaar.');
      const items: {merk?: string; handelsbenaming?: string; vervaldatum_apk?: string}[] = await response.json();
      if (!items.length) throw new Error('Kenteken niet gevonden. Controleer het kenteken.');
      const v=items[0], d=v.vervaldatum_apk;
      setRes({kenteken: plate, merk:v.merk || '', model:v.handelsbenaming || '', apk_vervaldatum:d ? date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`) : 'Niet beschikbaar bij de RDW'});
    } catch (x) { setErr(x instanceof Error ? x.message : 'De kentekencheck is tijdelijk niet beschikbaar.'); }
    setBusy(false);
  };
  return (
    <section id="apk" className="bg-white border-y border-slate-200">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="eyebrow mb-3">02 / Kentekencheck</div>
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-4">Direct inzicht</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Wanneer moet jouw auto <span className="font-serif-accent font-medium text-[#C0474A]">weer naar de APK?</span></h2>
          <p className="mt-4 text-slate-600">Voer je kenteken in en bekijk de vervaldatum rechtstreeks uit de openbare RDW-gegevens.</p>
        </div>
        <form onSubmit={check} className="border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8">
          <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3"><span>Jouw kenteken</span><span>01 — 02</span></div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex flex-1 items-stretch border-2 border-slate-900 bg-[#FACC15] rounded-[5px] overflow-hidden">
              <span className="bg-[#1D4ED8] text-white text-xs font-bold px-2 flex items-end pb-2">NL</span>
              <input data-testid="apk-kenteken-input" value={k} onChange={(e) => setK(e.target.value.toUpperCase())} placeholder="AB-123-C"
                className="flex-1 min-w-0 bg-transparent px-3 py-3 font-plate font-extrabold text-xl tracking-widest outline-none placeholder:text-slate-900/30" />
            </div>
            <button data-testid="apk-check-button" disabled={busy} className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3 font-semibold hover:bg-[#C0474A] transition-colors">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Bekijk APK-datum
            </button>
          </div>
          {err && <p data-testid="apk-error" className="mt-4 text-sm text-[#C0474A]">{err}</p>}
          {res && (
            <div data-testid="apk-result" className="mt-5 border border-slate-200 bg-white p-5 fade-up">
              <div className="flex items-center gap-3 flex-wrap"><span className="mini-plate font-plate">{res.kenteken}</span><span className="font-semibold">{res.merk} {res.model}</span></div>
              <div className="mt-3 text-sm text-slate-500">APK geldig tot</div>
              <div data-testid="apk-result-date" className="font-display text-2xl font-bold">{res.apk_vervaldatum || "Onbekend"}</div>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">Gegevens afkomstig van de RDW</p>
        </form>
      </div>
    </section>
  );
};

const FEATURES = [
  { Icon: Wrench, t: "Onderhoud & intervallen", d: "Geschiedenis bij Merkanic, adviespunten en wanneer de volgende beurt nodig is." },
  { Icon: Camera, t: "Foto’s & opmerkingen", d: "Werkfoto’s en monteur-notities bij elke klus, helder terug te lezen." },
  { Icon: FileText, t: "Facturen & afspraken", d: "Facturen openen en direct een afspraak inplannen in het portaal." },
];

const Portaal = () => {
  const { user } = useAuth();
  return (
    <section id="portaal" className="mx-auto max-w-7xl px-5 sm:px-8 py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
        <div>
          <div className="eyebrow mb-3">03 / Klantenportaal</div>
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-4">Inloggen · Auto & service</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Klantenportaal. <span className="font-serif-accent font-medium text-[#C0474A]">Alles van jouw auto.</span></h2>
        </div>
        <p className="text-slate-600 lg:pt-10">Log in om facturen te openen, onderhoudsgeschiedenis en foto's te bekijken, opmerkingen en adviespunten te lezen, intervallen te volgen en een afspraak te maken. Monteurs zien hier de werkplaats in één overzicht.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {FEATURES.map(({ Icon, t, d }) => (
          <div key={t} className="bg-white border border-slate-200 p-6 hover:-translate-y-0.5 hover:border-slate-900 transition-[transform,border-color]">
            <Icon className="h-5 w-5 text-[#C0474A] mb-4" />
            <div className="font-display font-semibold text-lg">{t}</div>
            <p className="text-sm text-slate-600 mt-1">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 bg-slate-900 text-white p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <CalendarCheck className="h-6 w-6 text-[#f08b8d] mb-3" />
          <div className="font-display text-2xl font-semibold">{user ? `Welkom terug, ${user.name}.` : "Welkom terug."}</div>
          <p className="text-slate-300 text-sm mt-1">{user ? "Ga verder naar je portaal." : "Log in om jouw portaal te bekijken, of registreer een nieuw account."}</p>
        </div>
        <div className="flex gap-3">
          <a href={user ? "#portaal" : "#login"} data-testid="portaal-login-button" className="bg-[#C0474A] px-6 py-3 font-semibold hover:bg-[#A8383B] transition-colors">{user ? "Naar portaal" : "Inloggen"}</a>
          {!user && <a href="#register" data-testid="portaal-register-button" className="border border-slate-600 px-6 py-3 font-semibold hover:border-white transition-colors">Registreren</a>}
        </div>
      </div>
    </section>
  );
};

const Afspraak = () => (
  <section id="afspraak" className="bg-white border-y border-slate-200">
    <div className="mx-auto max-w-7xl px-5 sm:px-8 py-20 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-12">
      <div>
        <div className="eyebrow mb-3">04 / Afspraak maken</div>
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-4">Snel geregeld</div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Plan je beurt. <span className="font-serif-accent font-medium text-[#C0474A]">Wij doen de rest.</span></h2>
        <p className="mt-4 text-slate-600">Kies de dienst en je voorkeursdatum. We bekijken je aanvraag en bevestigen de afspraak zo snel mogelijk.</p>
      </div>
      <div className="border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8"><HomeAppointmentForm /></div>
    </div>
  </section>
);

function MerkanicLanding({authContent, authOpen, onClose}: {authContent: React.ReactNode; authOpen: boolean; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d=dialog.current; if (!d) return; if (authOpen && !d.open) d.showModal(); else if (!authOpen && d.open) d.close(); }, [authOpen]);
  return (
    <div className="merkanic-landing min-h-screen bg-[#F1F5F9]" data-testid="landing-page">
      <NavBar />
      <Hero />
      <ApkCheck />
      <Portaal />
      <Afspraak />
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row justify-between gap-2 text-sm text-slate-500">
          <span>Facturen, onderhoud, foto's en afspraken — helder in je portaal.</span>
          <span>© {new Date().getFullYear()} Merkanic · <a href="mailto:info@merkanic.nl" className="hover:text-[#C0474A]">info@merkanic.nl</a></span>
        </div>
      </footer>
      <dialog ref={dialog} className="mk-auth-dialog" onClose={onClose} onCancel={onClose} aria-label="Inloggen op Merkanic"><button className="mk-auth-close" aria-label="Sluiten" onClick={() => dialog.current?.close()}><X size={20}/></button>{authContent}</dialog>
    </div>
  );
}

function HomeAppointmentForm() {
  const [form, setForm] = useState({name:'',email:'',phone:'',plate:'',service:'Kleine beurt',preferred_date:'',daypart:'Geen voorkeur',message:'',website:''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const change = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(prev => ({...prev,[key]:event.target.value}));
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await pb.send('/api/merkanic/appointment-requests', {method:'POST',body:{...form,plate:plateFormat(form.plate)}});
      setDone(true);
    } catch (e: unknown) { const problem=e as {response?: {message?: string}}; setError(problem.response?.message || 'De aanvraag is niet opgeslagen. Probeer het opnieuw of mail info@merkanic.nl.'); }
    finally { setBusy(false); }
  };
  if (done) return <div role="status" className="border border-emerald-300 bg-emerald-50 p-6 text-slate-900 fade-up"><CalendarCheck className="h-6 w-6 text-emerald-700 mb-3"/><h3 className="font-display text-lg font-semibold">Aanvraag ontvangen</h3><p className="mt-2 text-sm text-slate-600">Bedankt {form.name}. Je aanvraag voor {plateFormat(form.plate)} is opgeslagen. We nemen contact met je op om de afspraak te bevestigen.</p><button className="mt-5 border border-slate-300 px-5 py-3 font-semibold" onClick={()=>setDone(false)}>Nog een aanvraag</button></div>;
  const field='h-11 w-full rounded-none border border-slate-300 bg-white px-3 text-slate-900';
  const label='block space-y-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500';
  return <form onSubmit={submit} data-testid="appointment-form" className="grid sm:grid-cols-2 gap-4">
    <label className={label}>Naam *<input className={field} required minLength={2} maxLength={120} value={form.name} onChange={change('name')} autoComplete="name"/></label>
    <label className={label}>E-mailadres *<input className={field} required type="email" maxLength={254} value={form.email} onChange={change('email')} autoComplete="email"/></label>
    <label className={label}>Telefoon<input className={field} type="tel" maxLength={40} value={form.phone} onChange={change('phone')} autoComplete="tel"/></label>
    <label className={label}>Kenteken *<input className={field+' font-plate font-extrabold tracking-widest uppercase'} required minLength={4} maxLength={12} placeholder="AB-123-C" value={form.plate} onChange={change('plate')}/></label>
    <label className={label}>Dienst *<select className={field} value={form.service} onChange={change('service')}>{['Kleine beurt','Grote beurt','Olie wissel','APK','Banden wissel','Diagnose','Overig'].map(s=><option key={s}>{s}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3"><label className={label}>Voorkeursdatum *<input required className={field} type="date" min={minDate} value={form.preferred_date} onChange={change('preferred_date')}/></label><label className={label}>Dagdeel<select className={field} value={form.daypart} onChange={change('daypart')}>{['Geen voorkeur','Ochtend','Middag'].map(s=><option key={s}>{s}</option>)}</select></label></div>
    <label className={label+' sm:col-span-2'}>Toelichting<textarea className="w-full rounded-none border border-slate-300 bg-white p-3 normal-case tracking-normal font-normal text-sm" rows={3} maxLength={1000} placeholder="Klachten, wensen of vragen…" value={form.message} onChange={change('message')}/></label>
    <label className="mk-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={change('website')}/></label>
    {error && <p role="alert" className="sm:col-span-2 text-sm text-[#C0474A]">{error}</p>}
    <div className="sm:col-span-2"><button disabled={busy} className="inline-flex items-center gap-2 h-12 px-8 bg-[#C0474A] hover:bg-[#A8383B] text-white font-semibold">{busy && <Loader2 className="h-4 w-4 animate-spin"/>}{busy?'Versturen…':'Afspraak aanvragen'}</button><p className="mt-3 text-xs text-slate-500">Je afspraak is definitief zodra Merkanic deze heeft bevestigd.</p></div>
  </form>;
}


type OrderControlsProps = {
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
function OrderControls({
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
}: OrderControlsProps) {
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


type MonteurWerkplaatsProps = {
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
function MonteurWerkplaats({
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
}: MonteurWerkplaatsProps) {
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

type WorkOrderFormProps = {
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
function WorkOrderForm({
  vehicles,
  mechanics,
  defaultMechanic,
  onCreated,
  onNotice,
  onVehicleCreated,
}: WorkOrderFormProps) {
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

function WorkChecklist({ order, editable, onUpdate }: {
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
