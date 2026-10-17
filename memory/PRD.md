# Merkanic Werkplaats & Klantenportaal — PRD

## Original problem statement
"https://merkanic.nl/ dit is mijn website ik wil graag dat je de klanten portaal afmaakt hij is momenteel nog onvolledig ik moet werkorders kunnen maken er moet kenteken bij genoteerd worden auto kiezen uit lijst km stand auto standaardformulieren zoals grote beurt kleine beurt er moet status monteur zijn status van werk er moeten opmerking inlog is ori@merkanic.nl wachtwoord is Merkanic1! Bekijk wat er momenteel is gedaan in de portaal log in en maak het volledig"
Follow-up: "Monteurs gaan registreren via e-mail en wachten op goedkeuring ik moet automatische mail krijgen en daar in die mail met een klik een rol toewijzen onder anderen monteur beheerder etc" / "Ik heb goeie backend nodig zodat er folders worden gemaakt (mappen) op basis van kenteken zodat de orders erin staan als ik druk op een kenteken moet ik bijvoorbeeld order 1 oliewissel order 2 bandenwissel en dat allemaal per kenteken monteurs moeten ook historie zien van wat er allemaal aan de auto is gebeurd"

User choices: beheerder+monteurs create orders, klanten see only their own; RDW lookup; statuses Gepland/In behandeling/Wacht op onderdelen/Gereed/Afgehaald; templates Grote beurt, Kleine beurt, APK, Banden wissel, Diagnose (+Vrij).

## Architecture
- FastAPI + MongoDB (server.py), JWT (Bearer + httpOnly cookie), bcrypt, admin seeded from .env
- Emergent managed Resend email: registration -> email to NOTIFY_EMAIL with one-click role links (/api/approve/{token}?role=… -> confirm page -> POST)
- RDW open data (m9d7-ebf2, 8ys7-d773) for merk/model/bouwjaar/kleur/brandstof/APK
- React (CRA) + shadcn, routes /login, /portaal, /portaal/voertuigen(/:kenteken), /portaal/werkorders/nieuw, /portaal/werkorders/:id, /portaal/gebruikers
- Collections: users, vehicles (unique kenteken = map), workorders (number WO-xxxxx, volgnummer per kenteken, checklist, comments(internal flag), events), approval_tokens, counters, login_attempts
- Klant ↔ auto koppeling via vehicle.owner_email == klant e-mail

## Personas
Beheerder (Ori), Monteur, Klant

## Implemented (2026-10-17)
- Auth, registratie met goedkeuring (portaal + e-maillink), rollen beheren
- Werkorders: kenteken + RDW, auto uit lijst, km-stand, standaardformulier checklists, monteur, status, opmerkingen (intern/publiek), logboek
- Mappen per kenteken met Order 1, 2, … en volledige historie-tijdlijn
- Klantweergave read-only (+ opmerking plaatsen), interne notities verborgen
- Tested: iteration_1 (all core flows pass); fixes applied for lockout, volgnummer, event text, mobile overflow

## Implemented (2026-10-17, iteration 2-3)
- Werkfoto's per werkorder (Emergent object storage, auth-served, soft delete, magic-byte check)
- Automatic klantmail when status -> Gereed (to vehicle owner_email), internal log event
- Public landing page at / (hero, APK-check via /api/public/apk, klantenportaal section); unknown routes -> /
- Notification + reply-to email now info@merkanic.nl
- Afspraak plannen: public form on landing (#afspraak) + portal /portaal/afspraken (klant: request/cancel own; staff: confirm with date/time/note, Afgerond, Annuleren, Maak werkorder prefill). Admin email to info@merkanic.nl per request; confirmation email to logged-in klant on Bevestigd
- Email links use request Origin when it is an allowed origin (incl. https://merkanic.nl, https://www.merkanic.nl), else APP_URL; approval page uses relative links
- APK-herinnering: daily cron 08:00 Europe/Amsterdam (.emergent/crons.yml -> POST /api/cron/apk-reminders, Bearer WEBHOOK_CRON_SECRET, X-Webhook-Id dedupe). Mails owner_email when APK within 30 days (date refreshed from RDW first), once per APK date (atomic claim), retry on failure. Staff panel on Voertuigen page, beheerder "Nu controleren", per-car opt-out switch
- Email: if SMTP_PASSWORD set, sends via Mijndomein SMTP (mail.mijndomein.nl:465, from info@merkanic.nl), falls back to Emergent managed email on failure

## Backlog
- P1: Foto's bij werkorders (object storage), facturen, afspraken plannen
- P1: Klant e-mail bij status "Gereed"
- P2: Nederlandse datumkiezer, pagination, server.py opsplitsen
- Note: APP_URL / CORS_ORIGINS in backend .env must be updated to the production domain on deploy (email links)
