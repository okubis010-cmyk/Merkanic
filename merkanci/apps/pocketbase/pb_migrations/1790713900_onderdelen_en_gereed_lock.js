/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const orders = app.findCollectionByNameOrId('work_orders');

    // Groot opmerkingenveld "Wat moet er gebeuren?" op de werkorder.
    if (!orders.fields.getByName('remarks')) {
      orders.fields.add(new TextField({ name: 'remarks', max: 0 }));
    }

    // Monteurs mogen een gereedgemelde werkorder niet meer wijzigen (en hem ook
    // niet zelf terug op Bezig zetten); de beheerder kan dat wel. De monteur mag
    // de status nog wél naar Gereed zetten — daarna is de order vergrendeld.
    orders.updateRule =
      "(@request.auth.role = 'beheerder') || (@request.auth.role = 'monteur' && mechanic = @request.auth.id && ((@request.body.status:changed = false && status != 'Gereed') || (@request.body.status:changed = true && @request.body.status = 'Gereed')))";
    // Verwijderen mag alleen als de werkorder nog niet is begonnen (Gepland) en
    // de monteur hem zelf heeft aangemaakt; de beheerder mag altijd verwijderen.
    orders.deleteRule =
      "@request.auth.role = 'beheerder' || (@request.auth.role = 'monteur' && mechanic = @request.auth.id && status = 'Gepland')";
    app.save(orders);

    // Onderdelenbestellingen: per bestelling een record, de e-mail gaat via een
    // pb_hook (parts-order-email.pb.js) naar info@merkanic.nl.
    const parts = new Collection({
      type: 'base',
      name: 'parts_orders',
      listRule:
        "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.role = 'beheerder' || work_order.mechanic = @request.auth.id || work_order.owner = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.role = 'beheerder' || work_order.mechanic = @request.auth.id || work_order.owner = @request.auth.id)",
      createRule: "(@request.auth.role = 'monteur' || @request.auth.role = 'beheerder')",
      updateRule: "@request.auth.role = 'beheerder'",
      deleteRule: "@request.auth.role = 'beheerder'",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          collectionId: users.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'work_order',
          type: 'relation',
          collectionId: orders.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        { name: 'part', type: 'text', required: true, max: 0 },
        { name: 'quantity', type: 'number' },
        { name: 'note', type: 'text', max: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(parts);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('parts_orders'));
    const orders = app.findCollectionByNameOrId('work_orders');
    orders.fields.removeByName('remarks');
    orders.updateRule =
      "(@request.auth.role = 'beheerder') || (@request.auth.role = 'monteur' && mechanic = @request.auth.id)";
    orders.deleteRule = "@request.auth.role = 'beheerder'";
    app.save(orders);
  },
);
