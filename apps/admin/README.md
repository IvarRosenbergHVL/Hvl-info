# HVL Info Admin

React/Vite + Entra ID (MSAL browser). Supports creating places, registering devices, assigning placement/iBeacon IDs, displaying one-time enrollment codes and marking a physical BLE test. Not hardware-tested yet.

Copy `.env.example` to `.env`. Set tenant, SPA client ID and delegated API scope; register localhost redirect with Entra and authorize this client for the API scope. The signed-in technician must have the API admin app role. Configure `apps/api/.env`, run migrations, and start `npm run dev:api` and `npm run dev:admin` in separate terminals from repo root. Vite proxies `/api` to localhost:3000. Wi-Fi password belongs ONLY on the ESP32 local portal, not in PostgreSQL or this admin UI.

Setup code expires after 15 min. Physical BLE verification is manual. Deactivation is eventually consistent and will not immediately stop an offline beacon. Admin screens for renaming/replacing/moving and richer telemetry are follow-up work.

**Bekreft i drift:** Enheten må først ha rapportert gjeldende konfigurasjon i en autentisert HTTPS check-in siste 15 minutter. Teknikeren kontrollerer fysisk kabinett-nummer og UUID/Major/Minor med mobil/nRF Connect på riktig sted, deretter lagrer admin tidspunkt, operatør og config-versjon. «Bekreftet i drift» er installasjonsstatus, mens «sist kontakt» er periodisk nettstatus; ingen av dem er konstant radiosporing.


## Teknikerveiledning i admin

Én vedlikeholdt kilde: [`docs/TECHNICIAN-GUIDE.md`](../../docs/TECHNICIAN-GUIDE.md). Admin importerer Markdown-filen med Vite `?raw` og viser den under «Teknikerveiledning» etter Entra-innlogging med `react-markdown`/`remark-gfm`. Oppdater **kun Markdown-filen** når prosedyren endres; den blir del av neste admin-build uten separat kopi eller runtime-kall til GitHub. Veiledningen beskriver første oppsett, lokal AP uten internett, fysisk bekreftelse, BOOT-basert gjenoppretting og feilsøking.
