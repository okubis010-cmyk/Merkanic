/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const beheerder = "@request.auth.role = 'beheerder'";
  const ownOrBeheerder = "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.role = 'beheerder')";

  // Facturen: alleen de klant zelf en de beheerder — monteurs zien geen enkele factuur.
  const invoices = app.findCollectionByNameOrId('invoices');
  invoices.listRule = ownOrBeheerder;
  invoices.viewRule = ownOrBeheerder;
  invoices.createRule = beheerder;
  invoices.updateRule = beheerder;
  invoices.deleteRule = beheerder;
  app.save(invoices);

  // Afspraken: alleen de klant zelf en de beheerder.
  const appointments = app.findCollectionByNameOrId('appointments');
  appointments.listRule = ownOrBeheerder;
  appointments.viewRule = ownOrBeheerder;
  appointments.updateRule = beheerder;
  appointments.deleteRule = ownOrBeheerder;
  app.save(appointments);

  // Werkorders: een monteur ziet alleen orders die aan hem/haar zijn toegewezen.
  const orders = app.findCollectionByNameOrId('work_orders');
  orders.listRule =
    "@request.auth.id != '' && (owner = @request.auth.id || mechanic = @request.auth.id || @request.auth.role = 'beheerder')";
  orders.viewRule = orders.listRule;
  orders.updateRule = `(${beheerder}) || (@request.auth.role = 'monteur' && mechanic = @request.auth.id)`;
  orders.fields.add(new NumberField({ name: 'mileage' }));
  app.save(orders);

  // Gebruikers: monteurs kunnen geen andere accounts (klanten) meer inzien.
  const users = app.findCollectionByNameOrId('users');
  users.listRule = `id = @request.auth.id || ${beheerder}`;
  users.viewRule = users.listRule;
  app.save(users);

  // Foto's: de klant ziet foto's van zijn eigen werkorders, de monteur van zijn orders.
  const photos = app.findCollectionByNameOrId('photos');
  photos.listRule =
    "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.role = 'beheerder' || work_order.owner = @request.auth.id || work_order.mechanic = @request.auth.id)";
  photos.viewRule = photos.listRule;
  photos.updateRule = ownOrBeheerder;
  photos.deleteRule = ownOrBeheerder;
  app.save(photos);
}, (app) => {
  const staffRule = "(@request.auth.role = 'monteur' || @request.auth.role = 'beheerder')";
  const ownOrStaff =
    "@request.auth.id != '' && owner = @request.auth.id || (@request.auth.role = 'monteur' || @request.auth.role = 'beheerder')";
  const invoices = app.findCollectionByNameOrId('invoices');
  invoices.listRule = ownOrStaff;
  invoices.viewRule = ownOrStaff;
  invoices.createRule = staffRule;
  invoices.updateRule = staffRule;
  invoices.deleteRule = "@request.auth.role = 'beheerder'";
  app.save(invoices);
  const appointments = app.findCollectionByNameOrId('appointments');
  appointments.listRule = ownOrStaff;
  appointments.viewRule = ownOrStaff;
  appointments.updateRule = staffRule;
  appointments.deleteRule = ownOrStaff;
  app.save(appointments);
  const orders = app.findCollectionByNameOrId('work_orders');
  orders.listRule = ownOrStaff;
  orders.viewRule = ownOrStaff;
  orders.updateRule = staffRule;
  orders.fields.removeByName('mileage');
  app.save(orders);
  const users = app.findCollectionByNameOrId('users');
  users.listRule = "id = @request.auth.id || @request.auth.role = 'monteur' || @request.auth.role = 'beheerder'";
  users.viewRule = users.listRule;
  app.save(users);
  const photos = app.findCollectionByNameOrId('photos');
  photos.listRule = ownOrStaff;
  photos.viewRule = ownOrStaff;
  photos.updateRule = staffRule;
  photos.deleteRule = staffRule;
  app.save(photos);
});
