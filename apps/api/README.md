# HVL Info API

Aktiv MVP-backend er `src/mvp-server.ts`: Node.js/TypeScript + PostgreSQL for fire faste ESP32-S3 Super Mini iBeacon-sendere.

Beaconene har ingen Wi-Fi/provisioning i denne MVP-en. De sender felles UUID, `Major=1` og `Minor=beaconnummer`. Mobilappen avgjør proximity-event (`enter`, `near`, `exit`) og spør API-et om innhold.

## Lokal utvikling

```bash
docker compose -f infra/compose.yaml up -d
npm install
cp .env.example apps/api/.env
# Sett HVL_IBEACON_UUID i apps/api/.env
npm run db:migrate
npm run dev:api
```

API-et lytter på `127.0.0.1` som standard. Entra ID er utsatt. Hvis API-et eksponeres utenfor localhost eller kjøres med `NODE_ENV=production`, må `ADMIN_API_KEY` være satt til minst 16 tegn.

## Offentlig MVP-API

```text
GET /health
GET /api/config
GET /api/places
GET /api/places/:id
GET /api/beacons/:number?event=enter|near|exit
GET /api/beacons/resolve?uuid=...&major=1&minor=...&event=enter|near|exit
```

Resolve-responsen inneholder beacon, lokasjon og aktivt innhold for eventet.

## Admin-API

```text
GET/POST       /api/admin/places
PUT            /api/admin/places/:id

GET/POST       /api/admin/beacons
PUT            /api/admin/beacons/:number

GET/POST       /api/admin/content
PUT/DELETE     /api/admin/content/:id
```

Innholdstyper: `fun_fact`, `manual`, `message`, `link`.

Proximity-events: `enter`, `near`, `exit`.

Se [docs/PROXIMITY-EVENTS.md](../../docs/PROXIMITY-EVENTS.md).

## Legacy

Den tidligere Entra/provisioning-backenden ligger fortsatt i `src/server.ts` og kan kjøres med `npm run dev:legacy -w @hvl-info/api`. Den er ikke standard runtime for nåværende MVP.
