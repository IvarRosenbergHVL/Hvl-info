# HVL Info Admin

React/Vite + Entra ID (MSAL browser). Supports creating places, registering devices, assigning placement/iBeacon IDs, displaying one-time enrollment codes and marking a physical BLE test. Not hardware-tested yet.

Copy `.env.example` to `.env`. Set tenant, SPA client ID and delegated API scope; register localhost redirect with Entra and authorize this client for the API scope. The signed-in technician must have the API admin app role. Configure `apps/api/.env`, run migrations, and start `npm run dev:api` and `npm run dev:admin` in separate terminals from repo root. Vite proxies `/api` to localhost:3000. Wi-Fi password belongs ONLY on the ESP32 local portal, not in PostgreSQL or this admin UI.

Setup code expires after 15 min. Physical BLE verification is manual. Deactivation is eventually consistent and will not immediately stop an offline beacon. Admin screens for renaming/replacing/moving and richer telemetry are follow-up work.
