# HVL Info API – first vertical slice

Implemented: PostgreSQL migration; Entra ID access-token validation; room/place search and detail with guides/active incidents; UUID/Major/Minor lookup; Entra-admin protected place/device registration, manual placement, iBeacon assignment, physical-test confirmation, registry disable and audit. **It is not a deployed platform.**

## Local setup

```bash
docker compose -f infra/compose.yaml up -d
npm install
cp .env.example apps/api/.env
# Populate ENTRA_TENANT_ID, ENTRA_API_AUDIENCE and HVL_IBEACON_UUID
npm run db:migrate
npm run dev:api
```

Run commands from the repository root. `npm run build` builds shared contracts **before** the API. The local compose credentials are for isolated local development only. `/health` checks DB access; all `/api` paths fail closed until Entra is configured.

Entra token requirements: issuer for your tenant's v2 endpoint; audience = configured API resource; RS256 token; API delegated scope `HvlInfo.Read` (configurable), or admin app role `HvlInfo.Admin` (configurable). Only an admin-role token can use `/api/admin/*`. Configure actual scope names/roles in HVL tenant before integrating mobile/desktop/admin clients. The backend must receive an **access token for this API**, not an ID token. No passwords are stored here.

## First API calls

```text
GET    /health
GET    /api/places?q=M204
GET    /api/places/:id
GET    /api/beacons/resolve?uuid=<uuid>&major=100&minor=204

POST   /api/admin/places
       {"campus":"Kronstad","building":"Bygg 1","room_number":"M204","name":"Undervisningsrom M204","kind":"room"}
GET    /api/admin/devices
POST   /api/admin/devices
       {"hardware_id":"HVL-ESP-0001","model":"ESP32-C3 SuperMini"}
POST   /api/admin/devices/:id/placement
       {"place_id":"<place uuid>","role":"classroom_equipment"}
PUT    /api/admin/devices/:id/ibeacon
       {"major":100,"minor":204,"measured_power":-59}
POST   /api/admin/devices/:id/confirm
       {"physically_verified":true}
POST   /api/admin/devices/:id/disable
```

Send `Authorization: Bearer <API access token>` for every `/api` call. Install/flash the matching example iBeacon identity and verify on location **before** calling confirm. These endpoints register a device in PostgreSQL; they **do not** provision firmware, distribute Wi-Fi credentials, remotely disable a transmitter or verify radio transmission. The technician is responsible for physical disconnection when necessary.

## Known next steps

- Add a real provision/identity handshake and device credentials before connecting ESP32 to MQTT.
- Build the React admin, Expo mobile and Tauri desktop clients on these contracts.
- Add incident/guide editing, publication windows and anti-spam engine.
- Add migration/e2e/security tests against running PostgreSQL and Entra test registration.
- Integrate approved room data, Mime and HVL KI later.

No GitHub Actions are used.
