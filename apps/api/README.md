# HVL Info API

Node.js / TypeScript, PostgreSQL, Entra ID JWT validation. Felles backend for admin, mobil og desktop.

## Utvikling

Fra repo-roten:

```bash
docker compose -f infra/compose.yaml up -d
npm install
cp .env.example apps/api/.env
# Konfigurer ENTRA_TENANT_ID, ENTRA_API_AUDIENCE og HVL_IBEACON_UUID
npm run db:migrate
npm run dev:api
# nytt terminalvindu: cp apps/admin/.env.example apps/admin/.env
npm run dev:admin
```

Admin logger på mot Entra ID og sender et **access token for dette API-et**; `HvlInfo.Admin`-app-role kreves på server for administrasjon. `/device/*` autentiseres separat med kortlivet innrulleringskode eller per-device key. Produksjonsinngang må tvinge HTTPS; API-et kan ikke selv garantere korrekt ingress/nettsegmentering. `HVL_IBEACON_UUID` settes i backend, ikke av fysisk romnummer.

## API for enhetsflyt

```text
GET  /api/places
POST /api/admin/places
GET  /api/admin/devices
POST /api/admin/devices                   {hardware_id,friendly_name}
POST /api/admin/devices/:id/placement     {place_id,role}
PUT  /api/admin/devices/:id/ibeacon       {major,minor,measured_power?}
POST /api/admin/devices/:id/enrollment    {} -> provisioning_token (shown once; 15 min)
POST /device/provision                    {hardware_id,provisioning_token,name}
                                         -> device_id,device_key,config_version,config,poll_interval_seconds
POST /device/check-in                    Headers: x-device-id, x-device-key
                                         {hardware_id,config_version,firmware_version}
                                         -> config_version,config,poll_interval_seconds
POST /api/admin/devices/:id/confirm       {physically_verified:true}
POST /api/admin/devices/:id/disable       {}
GET  /api/beacons/resolve?uuid=...&major=...&minor=...
```

Wi-Fi-passord sendes **aldri** til backend – bare til lokal ESP32-portal. Enhetens rå nøkkel vises bare én gang ved innrullering, og backend lagrer hash. IBEACON UUID/Major/Minor kan offentliggjøres; de gir ingen rettighet i API. Innholdet for et rom hentes separat fra API-et.

**Status:** Pilotkode, ennå ikke bygget/kompilert mot faktisk PostgreSQL, Entra og ESP32. Utvidelser: redigere plassering/navn, credential revocation/rotation, OTA, flere tilgangsroller, end-to-end tester, adminopplevelse med QR og etikett.

**Installationsbekreftelse:** `POST /api/admin/devices/:id/confirm` aksepteres bare etter gyldig innrullering og autentisert check-in siste 15 minutter som rapporterer gjeldende config-versjon. Endpoint lagrer `verified_at`, `verified_by`, `verified_config_version` og audithendelse; operatøren bekrefter fysisk BLE-observasjon separat. Firmware sender check-in umiddelbart etter første innrullering. Kjør migrasjon 004 før nytt API.
