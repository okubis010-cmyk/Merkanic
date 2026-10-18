/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId('users');
  const workOrders = app.findCollectionByNameOrId('work_orders');
  const staff = "(@request.auth.role = 'monteur' || @request.auth.role = 'beheerder')";
  const own = "@request.auth.id != '' && owner = @request.auth.id";

  let photos;
  try {
    photos = app.findCollectionByNameOrId('photos');
  } catch (_) {
    photos = new Collection({
      type: 'base',
      name: 'photos',
      listRule: `${own} || ${staff}`,
      viewRule: `${own} || ${staff}`,
      createRule: staff,
      updateRule: staff,
      deleteRule: staff,
      fields: [
        { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'work_order', type: 'relation', collectionId: workOrders.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'image', type: 'file', maxSelect: 1, maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], required: true },
        { name: 'caption', type: 'text', max: 200 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(photos);
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('photos')); } catch (_) {}
});
