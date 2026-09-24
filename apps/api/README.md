# Enkel HVL Info-backend

Den aktive MVP-serveren er [`src/mvp-server.ts`](src/mvp-server.ts). ESP32-S3 sender bare iBeacon med samme UUID, Major 1 og Minor = nummer. Serveren kontakter aldri selve beaconen. Mobilen avgjør når `enter`, `near` eller `exit` skjer.

## Lokal oppstart (PowerShell)

Fra repo-roten:

```powershell
npm install
docker compose -f infra/compose.yaml up -d postgres
Copy-Item .env.example apps/api/.env
npm run db:migrate
npm run dev:api
```

`npm run db:migrate` kjører bare MVP-migrasjonene `005` og nyere; gamle provisioning-/Entra-tabeller opprettes ikke på en tom MVP-database. Migrasjonene er sporbart idempotente via `schema_migrations`.

Fra en ny terminal:

```powershell
npm run dev:admin
```

Helsesjekk: `http://127.0.0.1:3000/health`. Admin: `http://localhost:5173`.

## Offentlig API (lesende)

| Metode | Sti | Beskrivelse |
| --- | --- | --- |
| GET | `/health` | Databasehelsesjekk |
| GET | `/api/config` | Felles UUID, Major, events og typer |
| GET | `/api/places` | Lokasjonsoversikt |
| GET | `/api/places/:id` | Lokasjonsinfo og tilknyttet aktivt innhold |
| GET | `/api/beacons/:number?event=enter` | Finner beacon, lokasjon og innhold for event |
| GET | `/api/beacons/resolve?uuid=...&major=1&minor=3&event=near` | Validerer faktisk BLE-identitet og returnerer innhold |

Event er valgfritt; uten event returneres alt aktivt innhold for beaconen og lokasjonen. Uregistrert/deaktivert beacon gir HTTP 404. Ingen nærhets- eller brukerhistorikk lagres.

## Admin-API (skrive/lese)

| Metode | Sti |
| --- | --- |
| GET / POST | `/api/admin/places` |
| PUT / DELETE | `/api/admin/places/:id` |
| GET / POST | `/api/admin/beacons` |
| PUT / DELETE | `/api/admin/beacons/:number` |
| GET / POST | `/api/admin/content` |
| PUT / DELETE | `/api/admin/content/:id` |

Sletting av beacon fjerner innhold som er direkte knyttet til beaconen; lokasjonsinnhold blir igjen. Lokasjon kan ikke slettes mens den har registrerte beacons.

Innhold: `fun_fact`, `manual`, `message`, `link`. Innhold kan knyttes til én beacon eller én lokasjon. Felter: `trigger_event`, `title`, `body_markdown`, `action_url` (kun HTTP(S)), `priority`, `cooldown_seconds`, `enabled`, `active_from`, `active_to`. Prioritet og tidsvindu filtreres i API; cooldown tolkes og håndheves av mobilappen.

## Kjør integrasjons-smoketest

Bruk **dedikert lokal testdatabase** og kjør API-et før testen:

```powershell
$env:SMOKE_ALLOW_WRITES='yes'
npm run smoke:mvp
Remove-Item Env:SMOKE_ALLOW_WRITES
```

Testen sjekker opprettelse, oppslag, eventfilter, lokasjonstilknyttet innhold, identitet, avvisning av ugyldig lenke, aktivering/deaktivering, oppdatering og opprydding. Den kjører aldri automatisk via GitHub Actions.

## Sikkerhet og tilgjengelighet

Standard `API_HOST=127.0.0.1` – API-et er kun lokalt. Entra ID er utsatt. For LAN-testing fra telefon må API_HOST settes til en adresse telefonen når, og ADMIN_API_KEY (minimum 16 tegn) må konfigureres. Ikke send nøkkelen i klartekst over delt nett; bruk HTTPS/TLS og tilgangskontroll for pilot utenfor egen PC. API-et er et MVP-grensesnitt, ikke produksjonsklart autentiseringsoppsett.

Legacy-serveren `src/server.ts` og gamle migrasjoner finnes fortsatt; kjør dem bare eksplisitt med `npm run dev:legacy -w @hvl-info/api` / `npm run db:migrate:legacy -w @hvl-info/api` når det er hensikten.
