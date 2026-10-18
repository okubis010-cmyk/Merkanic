# Merkanic — huidige Hostinger-site

Deze map bevat de broncode van de huidige Merkanic-site op `merkanic.nl`, inclusief de React-frontend, PocketBase-hooks en migraties. De oorspronkelijke React/FastAPI/MongoDB-versie staat in de hoofdmap van deze repository. De twee versies gebruiken verschillende backends en mogen niet door elkaar worden gedeployed.

De live site draait in Hostinger AI Builder. Een wijziging in deze GitHub-map publiceert **niet automatisch** naar Hostinger; sla die ook op in het Builder-project en test het voorbeeld voordat je publiceert.

Er staan geen wachtwoorden, API-sleutels, `.env`-bestanden, klantdatabase of geüploade foto's in deze map. Voor lokaal draaien zijn aparte omgevingsinstellingen nodig. Voeg die niet aan GitHub toe.

Controle op 18 oktober 2026: de productiebuild en de route-tests zijn geslaagd. Registraties blijven in afwachting tot een beheerder een rol kiest en goedkeurt; de beheerderspagina toont de e-mailadressen via een afgeschermde route. Ontvangst van de registratiemail en de volledige werkorderstroom zijn nog niet met nieuwe live testgegevens bevestigd.

Lokaal controleren vanaf deze map:

```sh
npm ci
npm run build --workspace web
node --test portal-routes.test.mjs
```
