# HVL Info

**Arbeidstittel: HVL Kontekst** – et KI- og posisjonsdrevet informasjonssystem for studenter og ansatte ved HVL.

HVL Info knytter fysiske steder og utstyr til aktuell informasjon, selvbetjening og KI. En BLE-beacon kan gjøre appen oppmerksom på et område eller undervisningsrom; brukeren kan alltid finne det samme innholdet manuelt. Informasjon og handlinger styres i et felles administrasjonsgrensesnitt, ikke i firmware på hver sender.

> **Status:** Den aktive MVP-en er nå bevisst forenklet: fire ESP32-S3 Super Mini kjører som faste iBeacon-sendere uten Wi-Fi eller provisioning. Backend og React-admin registrerer beaconnummer, lokasjon og proximity-utløst innhold. Entra ID er utsatt; admin er localhost-only som standard og kan midlertidig sikres med `ADMIN_API_KEY`. Den tidligere provisioning-koden ligger fortsatt i repoet som legacy-spor, men er ikke standard runtime.

## Nåværende MVP

- Fire ESP32-S3 Super Mini på USB-strøm.
- Felles iBeacon UUID, `Major = 1`, `Minor = beaconnummer`.
- Teknikeren plasserer enheten og registrerer bare beaconnummer + lokasjon i admin.
- Ingen Wi-Fi, engangskode, enhetsnøkkel eller backend check-in på beaconen.
- Mobilappen lager proximity-eventene `enter`, `near` og `exit` fra BLE/RSSI.
- Backend leverer innhold for eventet: `fun_fact`, `manual`, `message` eller `link`.
- Brukermanual kan knyttes til lokasjonen; fun fact og annet innhold kan knyttes til beacon eller lokasjon.
- Admin har simulator for samme event-endpoint som mobilappen skal bruke.

Se [proximity-eventkontrakten](docs/PROXIMITY-EVENTS.md).

## Hva vi vil oppnå

- Relevant informasjon på riktig sted og tidspunkt, uten å spamme brukeren.
- Romtilpassede AV-/utstyrsmanualer, kjente driftsavvik og feilrapportering.
- Tidsstyrte lokale oppslag: eksempelvis workshop i læringslabben eller kantinetilbud.
- En felles inngang til HVLs KI-plattform og etter hvert Mime, med eksplisitt og begrenset stedskontekst.
- Samme informasjon og tjenester i mobilapp og desktop-app (Windows/macOS).
- En generisk plattform: Nye steder, sendere og innholdstyper opprettes i admin – ingen appoppdatering per rom eller kampanje.
- IT/drift kan registrere en beacon med nummeret preget på kabinettet, angi plassering og la backend automatisk tildele iBeacon-identitet; senere klargjøre, teste, flytte og avregistrere enheten i admin; se [enhetsregistrering og utplassering](docs/BEACON-PROVISIONING.md).

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
| Beacon / edge | ESP32-S3 SuperMini med iBeacon over BLE, lokal Wi-Fi-portal på første boot, deretter periodisk HTTPS over 2,4 GHz og USB-strøm |
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
│   └── esp32-s3/        # BLE + Wi-Fi + konfigurasjon + sikker oppdatering
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

Monter noen ESP32-S3 SuperMini på USB-strøm. En Android- og en iOS-development build skal kunne identifisere beacon, slå opp riktig rom og vise rommanual. Når avvik er registrert i admin skal det vises på romsiden. Søk på romnummer skal fungere identisk uten beacon. En tidsstyrt melding fra læringslabben skal kunne publiseres og vises uten ny firmware eller app-build. En Mime/HVL KI-knapp skal kunne åpne en samtale med avgrenset stedskontekst hvis integrasjonen er tilgjengelig.

**Tidlig risikopunkt:** Valider reell bakgrunnsoppdagelse, tillatelser og batteriforbruk på fysiske iPhone- og Android-enheter før vi lover automatisk varsling i alle situasjoner. Vanlig Expo Go er ikke tilstrekkelig for å teste alle native BLE-behov.

## Videre arbeid

Les [docs/PLAN.md](docs/PLAN.md), [docs/BEACON-PROVISIONING.md](docs/BEACON-PROVISIONING.md) og repoets hoved-issues. Begynn med gjennomførbarhetstesten for BLE/OS og domenemodellen, deretter én ende-til-ende romflyt. Desktop og utvidede integrasjoner kan bygges på de samme kontraktene.

## Kode som er lagt inn

- [`apps/api`](apps/api/README.md): første Entra-beskyttede Node.js API for romsøk, registrering, plassering og manuell verifisering av utplasserte enheter.
- [`packages/contracts`](packages/contracts/src/index.ts): iBeacon UUID/Major/Minor og 25-byte produsentdata med tester.
- [`apps/admin`](apps/admin/README.md): første Entra-beskyttede React-admin for steder, ESP32-registrering og engangskoder.
- [`firmware/esp32-s3`](firmware/esp32-s3/README.md): ESP32-S3 med lokalt mobiloppsett, non-connectable iBeacon og periodisk HTTPS (pilotkode).
- [`infra/compose.yaml`](infra/compose.yaml): lokal PostgreSQL og RabbitMQ (RabbitMQ er ikke nødvendig på selve ESP32).
- [Oppsettsflyt for ESP32](docs/ESP32-FIRST-BOOT.md): første boot via mobil, Wi-Fi, navn, innrullering og sjeldne nettøkter.

Etiketter, dokumentasjon og API-oppslag er ikke en erstatning for fysisk BLE-testing eller riktig Entra-konfigurasjon. Ingen GitHub Actions er lagt inn.


## Nummererte kabinetter og automatisk BLE-identitet

Teknikeren trenger bare nummeret som er preget på kabinettet (f.eks. `42`) og fysisk plassering i admin. Node.js oppretter intern UUID og tildeler unik Major/Minor under én felles system-UUID. ESP32-brikkens `hardware_id` registreres først når engangskoden brukes over HTTPS ved første oppsett. Det trykte nummeret er offentlig inventar-ID, **ikke en hemmelig autentiseringskode**. Les [inventar- og paringsflyten](docs/NUMBERED-BEACONS.md).

## Teknikerveiledning

[**Teknikerveiledning for ESP32-beacons**](docs/TECHNICIAN-GUIDE.md) er felles kilde for installasjon, mobiloppsett og feilretting. Samme Markdown-fil vises i React-admin via menyvalget «Teknikerveiledning»; endringer i filen følger neste admin-build.
