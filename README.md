# HVL Info

**Arbeidstittel: HVL Kontekst** – et KI- og posisjonsdrevet informasjonssystem for studenter og ansatte ved HVL.

HVL Info knytter fysiske steder og utstyr til aktuell informasjon, selvbetjening og KI. En BLE-beacon kan gjøre appen oppmerksom på et område eller undervisningsrom; brukeren kan alltid finne det samme innholdet manuelt. Informasjon og handlinger styres i et felles administrasjonsgrensesnitt, ikke i firmware på hver sender.

> **Status:** API, første React-admin og ESP32-C3-oppsettsportal med periodisk HTTPS-synk er kodet, men ikke fysisk testet. Expo og Tauri gjenstår. Se [implementeringsstatus](docs/IMPLEMENTATION-STATUS.md) og [prosjektplanen](docs/PLAN.md).

## Hva vi vil oppnå

- Relevant informasjon på riktig sted og tidspunkt, uten å spamme brukeren.
- Romtilpassede AV-/utstyrsmanualer, kjente driftsavvik og feilrapportering.
- Tidsstyrte lokale oppslag: eksempelvis workshop i læringslabben eller kantinetilbud.
- En felles inngang til HVLs KI-plattform og etter hvert Mime, med eksplisitt og begrenset stedskontekst.
- Samme informasjon og tjenester i mobilapp og desktop-app (Windows/macOS).
- En generisk plattform: Nye steder, sendere og innholdstyper opprettes i admin – ingen appoppdatering per rom eller kampanje.
- IT/drift kan registrere, klargjøre, plassere, teste, flytte og avregistrere utplasserte ESP32-beacons i admin; se [enhetsregistrering og utplassering](docs/BEACON-PROVISIONING.md).

## Planlagt teknologistack

| Del | Teknologi / ansvar |
| --- | --- |
| Monorepo | Node.js, TypeScript, npm workspaces (foreløpig valg) |
| API og bakgrunnsjobber | Node.js; REST, autorisasjon, regelmotor, enhetsstyring |
| Database | PostgreSQL, migrasjoner, relasjoner mellom lokasjoner, beacons, innhold og avvik |
| Autentisering | Microsoft Entra ID for studenter og ansatte, med rollebasert tilgang til administrasjon og API |
| Meldingsformidling | RabbitMQ for backend-jobber; ESP32 henter konfigurasjon via kort, periodisk HTTPS-tilkobling (ikke vedvarende MQTT) |
| Mobil | React Native + Expo, Android/iOS; development builds for nødvendige native BLE-funksjoner |
| Desktop | Tauri + React, Windows/macOS; native BLE-adapter/plugin undersøkes og testes |
| Admin | React; designsystemet.no der komponenter egner seg |
| Beacon / edge | ESP32-C3 SuperMini med iBeacon over BLE, lokal Wi-Fi-portal på første boot, deretter periodisk HTTPS over 2,4 GHz og USB-strøm |
| Integrasjoner | HVL KI, Mime, rom-/utstyrsregister og eventuelt supportsystem/kalender når avklart |

Dette er en plan, ikke en påstand om at disse integrasjonene allerede finnes.

## Monorepo – foreslått struktur

```text
Hvl-info/
├── apps/
│   ├── api/             # HTTP API, auth, regler, innhold og integrasjoner
│   ├── worker/          # RabbitMQ-konsumenter, planlagt publisering og enhetsjobber
│   ├── admin/           # React webadministrasjon
│   ├── mobile/          # React Native / Expo
│   └── desktop/         # Tauri + React (Windows/macOS)
├── packages/
│   ├── contracts/       # Delte DTO-er, validering og hendelseskontrakter
│   ├── domain/          # Delt domenelogikk som ikke er klientspesifikk
│   └── ui/              # Gjenbrukbare webkomponenter der det gir mening
├── firmware/
│   └── esp32-c3/        # BLE + Wi-Fi + konfigurasjon + sikker oppdatering
├── hardware/
│   └── enclosure/       # 3D-print / monteringsgrunnlag
├── infra/               # Lokal PostgreSQL/RabbitMQ, senere K8s-manifester
└── docs/
    └── PLAN.md
```

Ingen selvstendige repoer er planlagt for klientene eller backend. Delte typer og API-kontrakter skal ligge i monorepoet.

## Prinsipper som styrer implementasjonen

1. **Microsoft Entra ID er felles autentisering.** Mobil (Expo), desktop (Tauri) og admin bruker OIDC/OAuth 2.0 med Authorization Code + PKCE; API-et validerer tokens og autoriserer tilgang. Ingen egen passorddatabase.
2. **iBeacon over BLE er valgt for første senderformat.** Bruk felles namespace og unike UUID/Major/Minor-kombinasjoner; bind dem til fysiske enheter og steder via database, ikke kod romnummer inn i BLE-signalet. Beacon er kontekst, ikke innhold.  Send en stabil identifikator over BLE; appen henter autorisert og tidsaktuelt innhold via HTTPS. Wi-Fi/HTTPS brukes bare kortvarig ved første registrering og periodisk for konfigurasjon/status. Dynamiske annonseringsidentifikatorer er valgfritt senere, ikke et MVP-krav.
3. **Mobil og desktop snakker med API-et.** De skal ikke ha direkte RabbitMQ-tilgang. Enhetene trenger heller ikke registrere hvem som er i nærheten.
4. **To oppdagelsesmoduser.** Bakgrunnsoppdagelse av utvalgte lokasjoner der OS-et tillater det, og aktivt BLE-søk når brukeren velger f.eks. «Klasseromveiledning».
5. **Manuell fallback.** Søk på romnummer eller velg campus/bygg/rom om beacon mangler, telefonen ikke gir tilgang eller radioen er avslått.
6. **Stabilitet før «nærmest».** Flere RSSI-observasjoner, terskler, hysterese og prioritet; ved usikkerhet vis flere treff i stedet for å gjette rom.
7. **Minst mulig støy.** Kategorivalg, avgrenset tidsrom, relevans, kjølingstid og deduplisering. Manuelle oppslag skal aldri hindres av varslingsbegrensningene.
8. **Dataminimering.** Ikke bygg sentral bevegelseshistorikk. Klientens nærhetsmålinger behandles lokalt så langt som mulig. Brukerkontekst og KI-tilgang følger autorisasjon og samtykke.
9. **Ingen sikkerhetskritisk avhengighet.** Mobil-OS garanterer ikke øyeblikkelig bakgrunnsvarsling; nødvarsling og kritisk drift må ha andre kanaler.

## Første demo

Monter noen ESP32-C3 SuperMini på USB-strøm. En Android- og en iOS-development build skal kunne identifisere beacon, slå opp riktig rom og vise rommanual. Når avvik er registrert i admin skal det vises på romsiden. Søk på romnummer skal fungere identisk uten beacon. En tidsstyrt melding fra læringslabben skal kunne publiseres og vises uten ny firmware eller app-build. En Mime/HVL KI-knapp skal kunne åpne en samtale med avgrenset stedskontekst hvis integrasjonen er tilgjengelig.

**Tidlig risikopunkt:** Valider reell bakgrunnsoppdagelse, tillatelser og batteriforbruk på fysiske iPhone- og Android-enheter før vi lover automatisk varsling i alle situasjoner. Vanlig Expo Go er ikke tilstrekkelig for å teste alle native BLE-behov.

## Videre arbeid

Les [docs/PLAN.md](docs/PLAN.md), [docs/BEACON-PROVISIONING.md](docs/BEACON-PROVISIONING.md) og repoets hoved-issues. Begynn med gjennomførbarhetstesten for BLE/OS og domenemodellen, deretter én ende-til-ende romflyt. Desktop og utvidede integrasjoner kan bygges på de samme kontraktene.

## Kode som er lagt inn

- [`apps/api`](apps/api/README.md): første Entra-beskyttede Node.js API for romsøk, registrering, plassering og manuell verifisering av utplasserte enheter.
- [`packages/contracts`](packages/contracts/src/index.ts): iBeacon UUID/Major/Minor og 25-byte produsentdata med tester.
- [`apps/admin`](apps/admin/README.md): første Entra-beskyttede React-admin for steder, ESP32-registrering og engangskoder.
- [`firmware/esp32-c3`](firmware/esp32-c3/README.md): ESP32-C3 med lokalt mobiloppsett, iBeacon og periodisk HTTPS (pilotkode).
- [`infra/compose.yaml`](infra/compose.yaml): lokal PostgreSQL og RabbitMQ (RabbitMQ er ikke nødvendig på selve ESP32).
- [Oppsettsflyt for ESP32](docs/ESP32-FIRST-BOOT.md): første boot via mobil, Wi-Fi, navn, innrullering og sjeldne nettøkter.

Etiketter, dokumentasjon og API-oppslag er ikke en erstatning for fysisk BLE-testing eller riktig Entra-konfigurasjon. Ingen GitHub Actions er lagt inn.
