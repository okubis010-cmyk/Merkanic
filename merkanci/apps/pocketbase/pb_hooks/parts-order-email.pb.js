/// <reference path="../pb_data/types.d.ts" />
// Verstuurt elke nieuwe onderdelenbestelling per e-mail naar info@merkanic.nl.
onRecordAfterCreateSuccess(
  (e) => {
    try {
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      const order = $app.findRecordById('work_orders', e.record.get('work_order'));
      const vehicle = $app.findRecordById('vehicles', order.get('vehicle'));

      let mechanicName = 'Onbekend';
      try {
        const mechanic = $app.findRecordById('users', e.record.get('owner'));
        mechanicName = mechanic.get('name') || mechanic.get('email') || 'Onbekend';
      } catch (_) {
        // geen monteur gekoppeld — val terug op 'Onbekend'
      }

      const part = e.record.get('part') || '';
      const quantity = e.record.get('quantity') || 1;
      const note = e.record.get('note') || '';
      const plate = vehicle.get('plate') || '';
      const description = order.get('description') || '';

      const message = new MailerMessage({
        from: { name: 'Merkanic Werkplaats' },
        to: [{ address: 'info@merkanic.nl' }],
        subject: 'Onderdelenbestelling — ' + plate.replace(/[\r\n]/g, ' '),
        html: [
          '<h2>Nieuwe onderdelenbestelling</h2>',
          '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">',
          '<tr><td><strong>Kenteken</strong></td><td>' + escapeHtml(plate) + '</td></tr>',
          '<tr><td><strong>Werkorder</strong></td><td>' + escapeHtml(description) + '</td></tr>',
          '<tr><td><strong>Onderdeel</strong></td><td>' + escapeHtml(part) + '</td></tr>',
          '<tr><td><strong>Hoeveelheid</strong></td><td>' + escapeHtml(quantity) + '</td></tr>',
          '<tr><td><strong>Toelichting</strong></td><td>' + escapeHtml(note || '—') + '</td></tr>',
          '<tr><td><strong>Besteld door</strong></td><td>' + escapeHtml(mechanicName) + '</td></tr>',
          '</table>',
        ].join(''),
      });

      $app.newMailClient().send(message);
    } catch (err) {
      $app.logger().error('onderdelenbestelling e-mail mislukt', 'err', String(err));
    }

    e.next();
  },
  'parts_orders',
);
// Merkanic portal: narrowly scoped workorder actions on the existing database.
routerAdd('PATCH', '/api/merkanic/work-orders/{id}', (e) => {
  const body = e.requestInfo().body;
  const role = e.auth.getString('role');
  const admin = role === 'beheerder';
  if (!admin && role !== 'monteur') throw new ForbiddenError('Alleen voor de werkplaats.');
  const allowed = ['status', 'car_present', 'parts_arrived', 'parts_location', 'mechanic', 'mileage', 'arrival', 'checklist'];
  if (Object.keys(body).some(k => allowed.indexOf(k) < 0)) throw new BadRequestError('Onbekend werkorderveld.');
  if ('mechanic' in body && !admin) throw new ForbiddenError('Alleen de beheerder wijst monteurs toe.');
  if ('status' in body && ['Gepland','Bezig','Gereed'].indexOf(body.status) < 0) throw new BadRequestError('Ongeldige status.');
  ['car_present','parts_arrived'].forEach(k => { if (k in body && typeof body[k] !== 'boolean') throw new BadRequestError('Ongeldige waarde.'); });
  if ('parts_location' in body && (typeof body.parts_location !== 'string' || body.parts_location.length > 300)) throw new BadRequestError('Ongeldige onderdelenlocatie.');
  if ('mileage' in body && (typeof body.mileage !== 'number' || !Number.isInteger(body.mileage) || body.mileage < 0 || body.mileage > 9999999)) throw new BadRequestError('Ongeldige kilometerstand.');
  if ('arrival' in body && (typeof body.arrival !== 'string' || (body.arrival && !Number.isFinite(Date.parse(body.arrival))))) throw new BadRequestError('Ongeldige datum.');
  if ('checklist' in body && (!Array.isArray(body.checklist) || body.checklist.length > 60 || body.checklist.some(task =>
    !task || typeof task !== 'object' || typeof task.id !== 'string' || task.id.length > 40 ||
    typeof task.label !== 'string' || !task.label.trim() || task.label.length > 200 ||
    typeof task.done !== 'boolean' || typeof task.form !== 'string' || task.form.length > 60 ||
    (task.note !== undefined && (typeof task.note !== 'string' || task.note.length > 500))
  ))) throw new BadRequestError('Ongeldige checklist.');
  let result;
  e.app.runInTransaction(tx => {
    const order = tx.findRecordById('work_orders', e.request.pathValue('id'));
    if (!admin && (order.getString('mechanic') !== e.auth.id || order.getString('status') === 'Gereed')) throw new ForbiddenError('Deze werkorder mag je niet wijzigen.');
    if ('mechanic' in body && body.mechanic) {
      const mechanic = tx.findRecordById('users', String(body.mechanic));
      if (['monteur','beheerder'].indexOf(mechanic.getString('role')) < 0) throw new BadRequestError('Kies een monteur.');
    }
    Object.keys(body).forEach(k => order.set(k, body[k]));
    tx.save(order);
    result = { id: order.id };
  });
  return e.json(200, result);
}, $apis.requireAuth('users'), $apis.bodyLimit(16384));

routerAdd('POST', '/api/merkanic/work-orders/{id}/notes', (e) => {
  const body = e.requestInfo().body;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!note || note.length > 4000) throw new BadRequestError('Vul een opmerking in van maximaal 4000 tekens.');
  const role = e.auth.getString('role');
  if (role !== 'beheerder' && role !== 'monteur') throw new ForbiddenError('Alleen voor de werkplaats.');
  let result;
  e.app.runInTransaction(tx => {
    const order = tx.findRecordById('work_orders', e.request.pathValue('id'));
    if (role !== 'beheerder' && (order.getString('mechanic') !== e.auth.id || order.getString('status') === 'Gereed')) throw new ForbiddenError('Deze werkorder mag je niet wijzigen.');
    const before = order.getString('remarks');
    const author = (e.auth.getString('name') || 'Medewerker').replace(/[\r\n]/g, ' ').slice(0,100);
    const next = before + (before ? '\n\n' : '') + '[' + new Date().toISOString() + ' · ' + author + ']\n' + note;
    if (next.length > 100000) throw new BadRequestError('Deze werkorder bevat te veel notities.');
    order.set('remarks', next);
    tx.save(order);
    result = { id: order.id, remarks: next };
  });
  return e.json(200, result);
}, $apis.requireAuth('users'), $apis.bodyLimit(16384));

// Additive storage for public appointment enquiries; existing collections are untouched.
onBootstrap((e) => {
  e.next();
  const users = e.app.findCollectionByNameOrId('users');
  if (!users.fields.getByName('status')) {
    users.fields.add(new SelectField({name:'status',maxSelect:1,values:['pending','active','rejected']}));
  }
  users.authRule = "status = 'active'";
  users.createRule = "(@request.body.role:isset = false || @request.body.role = 'klant') && (@request.body.status:isset = false || @request.body.status = 'pending')";
  users.updateRule = "(id = @request.auth.id && @request.body.role:changed = false && @request.body.status:changed = false) || @request.auth.role = 'beheerder'";
  e.app.save(users);
  for (const account of e.app.findAllRecords('users')) {
    if (account.getString('status')) continue;
    account.set('status', account.getString('role') === 'beheerder' ? 'active' : 'pending');
    e.app.save(account);
  }
  const orders = e.app.findCollectionByNameOrId('work_orders');
  if (!orders.fields.getByName('checklist')) {
    orders.fields.add(new JSONField({name:'checklist',maxSize:65536}));
    e.app.save(orders);
  }
  if (e.app.findAllCollections().some(c => c.name === 'appointment_requests')) return;
  const admin = "@request.auth.id != '' && @request.auth.role = 'beheerder'";
  const collection = new Collection({type:'base',name:'appointment_requests',listRule:admin,viewRule:admin,createRule:null,updateRule:admin,deleteRule:null,fields:[
    {name:'name',type:'text',required:true,max:120},
    {name:'email',type:'email',required:true},
    {name:'phone',type:'text',max:40},
    {name:'plate',type:'text',required:true,max:10},
    {name:'service',type:'text',required:true,max:50},
    {name:'preferred_date',type:'text',required:true,max:10},
    {name:'daypart',type:'text',max:30},
    {name:'message',type:'text',max:1000},
    {name:'status',type:'select',required:true,maxSelect:1,values:['Aangevraagd','Bevestigd','Afgewezen']},
    {name:'created',type:'autodate',onCreate:true,onUpdate:false},
    {name:'updated',type:'autodate',onCreate:true,onUpdate:true}
  ],indexes:['CREATE INDEX idx_appointment_requests_email_created ON appointment_requests (email, created)']});
  e.app.save(collection);
});

// Registration remains pending until the Merkanic beheerder assigns a role.
onRecordCreateRequest((e) => {
  e.record.set('role', 'klant');
  e.record.set('status', 'pending');
  e.next();
}, 'users');

onRecordAuthRequest((e) => {
  if (e.record.getString('status') !== 'active') {
    throw new ForbiddenError('Je account wacht op goedkeuring door Merkanic.');
  }
  e.next();
}, 'users');

onRecordAfterCreateSuccess((e) => {
  try {
    const clean = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const account = e.record;
    e.app.newMailClient().send(new MailerMessage({
      from:{name:'Merkanic'},
      to:[{address:'info@merkanic.nl'}],
      subject:'Nieuwe registratie wacht op goedkeuring',
      html:'<h2>Nieuwe registratie</h2><p>Naam: '+clean(account.getString('name'))+'</p><p>E-mailadres: '+clean(account.getString('email'))+'</p><p>Log in op merkanic.nl en open Gebruikers om klant, monteur of beheerder te kiezen.</p>'
    }));
  } catch (_) {
    e.app.logger().warn('Registratie opgeslagen; notificatiemail niet verstuurd.');
  }
  e.next();
}, 'users');

// PocketBase hides email on ordinary user-list responses when emailVisibility is false.
// Return only the fields needed for approval, and only to an active beheerder.
routerAdd('GET', '/api/merkanic/admin/users', (e) => {
  if (e.auth.getString('role') !== 'beheerder' || e.auth.getString('status') !== 'active') {
    throw new ForbiddenError('Alleen voor de beheerder.');
  }
  const accounts = e.app.findAllRecords('users').map(account => ({
    id: account.id,
    name: account.getString('name'),
    email: account.getString('email'),
    role: account.getString('role'),
    status: account.getString('status'),
  }));
  return e.json(200, { users: accounts });
}, $apis.requireAuth('users'));

routerAdd('POST','/api/merkanic/appointment-requests',(e) => {
  const body = e.requestInfo().body;
  const str = (key,max) => { const value=body[key]; if (typeof value !== 'string' || value.length > max) throw new BadRequestError('Controleer de ingevulde gegevens.'); return value.trim(); };
  if (body.website) throw new BadRequestError('De aanvraag kon niet worden verwerkt.');
  const name=str('name',120),email=str('email',254).toLowerCase(),phone=str('phone',40),plate=str('plate',12).toUpperCase().replace(/[^A-Z0-9]/g,''),service=str('service',50),preferred=str('preferred_date',10),daypart=str('daypart',30),message=str('message',1000);
  if (name.length < 2 || /[\x00-\x1f]/.test(name+email+phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[A-Z0-9]{4,10}$/.test(plate)) throw new BadRequestError('Controleer je naam, e-mailadres en kenteken.');
  if (['Kleine beurt','Grote beurt','Olie wissel','APK','Banden wissel','Diagnose','Overig'].indexOf(service)<0 || ['Geen voorkeur','Ochtend','Middag'].indexOf(daypart)<0) throw new BadRequestError('Kies een geldige dienst en dagdeel.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferred) || !Number.isFinite(Date.parse(preferred)) || new Date(preferred).toISOString().slice(0,10)!==preferred || preferred < new Date(Date.now()-86400000).toISOString().slice(0,10)) throw new BadRequestError('Kies een geldige voorkeursdatum.');
  let id;
  e.app.runInTransaction(tx => {
    const since=new Date(Date.now()-86400000).toISOString().replace('T',' ');
    const recent=tx.findRecordsByFilter('appointment_requests','email = {:email} && created >= {:since}','',3,0,{email,since});
    if (recent.length >= 3) throw new BadRequestError('Je hebt al meerdere aanvragen verstuurd. Neem contact op via info@merkanic.nl.');
    const record=new Record(tx.findCollectionByNameOrId('appointment_requests'));
    Object.entries({name,email,phone,plate,service,preferred_date:preferred,daypart,message,status:'Aangevraagd'}).forEach(([k,v])=>record.set(k,v));
    tx.save(record);id=record.id;
  });
  try {
    const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
    e.app.newMailClient().send(new MailerMessage({from:{name:'Merkanic'},to:[{address:'info@merkanic.nl'}],subject:'Afspraakaanvraag '+plate,html:'<h2>Nieuwe afspraakaanvraag</h2>'+Object.entries({Naam:name,'E-mailadres':email,Telefoon:phone,Kenteken:plate,Dienst:service,Voorkeursdatum:preferred,Dagdeel:daypart,Toelichting:message}).map(([k,v])=>'<p><b>'+esc(k)+'</b>: '+esc(v)+'</p>').join('')}));
  } catch (_) { e.app.logger().warn('Afspraakaanvraag opgeslagen; notificatiemail niet verstuurd.'); }
  return e.json(201,{id,name,plate,status:'Aangevraagd'});
},$apis.bodyLimit(8192));

