/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId('users');
  users.fields.add(new SelectField({ name: 'role', maxSelect: 1, values: ['klant', 'monteur', 'beheerder'] }));
  users.createRule = "@request.body.role:isset = false || @request.body.role = 'klant'";
  users.updateRule = "(id = @request.auth.id && @request.body.role:changed = false) || @request.auth.role = 'beheerder'";
  users.listRule = "id = @request.auth.id || @request.auth.role = 'monteur' || @request.auth.role = 'beheerder'";
  users.viewRule = users.listRule;
  app.save(users);
  const staff = "(@request.auth.role = 'monteur' || @request.auth.role = 'beheerder')";
  const own = "@request.auth.id != '' && owner = @request.auth.id";
  const owner = { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true };
  const dates = [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }, { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
  const vehicles = new Collection({ type: 'base', name: 'vehicles', listRule: `${own} || ${staff}`, viewRule: `${own} || ${staff}`, createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id", updateRule: `${own} || ${staff}`, deleteRule: `${own} || @request.auth.role = 'beheerder'`, fields: [owner, { name: 'plate', type: 'text', required: true, max: 12 }, { name: 'make', type: 'text' }, { name: 'model', type: 'text' }, { name: 'apk_date', type: 'date' }, ...dates] });
  app.save(vehicles);
  const orders = new Collection({ type: 'base', name: 'work_orders', listRule: `${own} || ${staff}`, viewRule: `${own} || ${staff}`, createRule: staff, updateRule: staff, deleteRule: "@request.auth.role = 'beheerder'", fields: [owner, { name: 'vehicle', type: 'relation', collectionId: vehicles.id, maxSelect: 1, required: true }, { name: 'description', type: 'text', required: true }, { name: 'status', type: 'select', maxSelect: 1, values: ['Gepland', 'Bezig', 'Gereed'] }, { name: 'arrival', type: 'date' }, { name: 'car_present', type: 'bool' }, { name: 'parts_arrived', type: 'bool' }, { name: 'parts_location', type: 'text' }, { name: 'mechanic', type: 'relation', collectionId: users.id, maxSelect: 1 }, { name: 'photos', type: 'file', maxSelect: 10, protected: true }, ...dates] });
  app.save(orders);
  app.save(new Collection({ type: 'base', name: 'invoices', listRule: `${own} || ${staff}`, viewRule: `${own} || ${staff}`, createRule: staff, updateRule: staff, deleteRule: "@request.auth.role = 'beheerder'", fields: [owner, { name: 'vehicle', type: 'relation', collectionId: vehicles.id, maxSelect: 1, required: true }, { name: 'number', type: 'text', required: true }, { name: 'amount', type: 'number' }, { name: 'document', type: 'file', maxSelect: 1, protected: true }, ...dates] }));
  app.save(new Collection({ type: 'base', name: 'appointments', listRule: `${own} || ${staff}`, viewRule: `${own} || ${staff}`, createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id", updateRule: staff, deleteRule: `${own} || ${staff}`, fields: [owner, { name: 'vehicle', type: 'relation', collectionId: vehicles.id, maxSelect: 1, required: true }, { name: 'requested_at', type: 'date', required: true }, { name: 'reason', type: 'text', required: true }, { name: 'status', type: 'select', maxSelect: 1, values: ['Aangevraagd', 'Bevestigd', 'Afgewezen'] }, ...dates] }));
}, (app) => {
  for (const name of ['appointments', 'invoices', 'work_orders', 'vehicles']) app.delete(app.findCollectionByNameOrId(name));
  const users = app.findCollectionByNameOrId('users'); users.fields.removeByName('role'); app.save(users);
});