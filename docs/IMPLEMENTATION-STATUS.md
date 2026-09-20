# Implementation status (first code tranche)

| Area | Current state |
| --- | --- |
| Root npm workspaces | Added for API and shared contracts |
| PostgreSQL | Local compose, baseline schema and migration runner |
| Entra ID | API access-token validation and admin-role checks coded; tenant registration/config not yet integrated or tested |
| Node.js API | Room lookup and manual device inventory / iBeacon assignment implemented |
| Shared iBeacon contract | Binary 25-byte encoder/decoder and tests added |
| ESP32-C3 | USB-powered iBeacon advertising sketch added; verify on real hardware |
| RabbitMQ | Local container only, **no secure MQTT device integration yet** |
| Admin / Expo / Tauri | Reserved under `apps/`; no functional client code yet |
| KI / Mime | Planned, not implemented |

**These changes have not been validated against a physical SuperMini, Entra tenant or running PostgreSQL in this GitHub-only pass.** Do not deploy as-is. Next: run `npm install`, shared tests, TS build, local database smoke test, hardware and iOS/Android tests, then build Entra-authenticated admin and client screens.

No GitHub Actions.
