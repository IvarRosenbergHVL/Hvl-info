# Prosjektplan – HVL Info (arbeidstittel HVL Kontekst)

**Status:** Planutkast. **Omfang:** Ett monorepo for backend, mobil, desktop, webadministrasjon, firmware og infrastruktur.

## Mål

Et KI- og posisjonsdrevet informasjonssystem for studenter og ansatte. Riktig rom- og stedskontekst skal gjøre eksisterende informasjon, tjenester og HVLs KI/Mime tilgjengelig der den trengs. Beacon er en frivillig snarvei; manuelt romsøk fungerer alltid. MVP skal være generisk, ikke hardkodet til én kampanje eller ett rom.

## Valgt teknologistack

- Node.js og TypeScript for API og worker; PostgreSQL med migrasjoner; RabbitMQ for asynkrone jobber og enhetsmeldinger.
- React til admin; React Native med Expo development builds til iOS/Android; Tauri med React til Windows/macOS.
- **Microsoft Entra ID** som autentisering for studenter og ansatte i alle tre klienter. OIDC/OAuth 2.0 Authorization Code + PKCE, systemnettleser og korrekt redirect-flyt per klient. API validerer issuer, audience, signatur, levetid og relevante scopes/roller. Administrasjon autoriseres på server, ikke av skjulte UI-elementer. Ikke lag egen passordløsning.
- ESP32-C3 SuperMini: BLE-beacon, Wi-Fi og USB-strøm i 3D-printet kapsling. RabbitMQ MQTT-plugin over TLS er én kandidat for enhetskommunikasjon og må verifiseres; AMQP for backend/worker.
- Integrasjonsadaptere for HVL KI/Mime, rom/utstyr, driftsavvik og senere timeplan og øvrige HVL-tjenester. Anta ikke at adapterne allerede finnes.

## Foreslått monorepo

```text
apps/
  api/                  # Node.js REST, auth, regelmotor, domenetjenester
  worker/               # RabbitMQ, tidsstyrte jobber, enhetskommandoer
  admin/                # React webadministrasjon
  mobile/               # React Native + Expo (native BLE development build)
  desktop/              # Tauri + React, Windows/macOS
packages/
  contracts/            # Delte DTO-er, validering, API-/hendelseskontrakter
  domain/               # Delte domeneregler
  ui/                   # Gjenbrukbare web-komponenter
firmware/esp32-c3/      # BLE/Wi-Fi, konfigurasjon, status
hardware/enclosure/     # 3D-print og monteringsfiler
infra/                  # Lokal database, RabbitMQ, K8s-konfigurasjon senere
docs/                   # Arkitektur, beslutninger, testresultater, plan
```

Node.js workspaces som utgangspunkt. Alle apper benytter samme API-kontrakter; ikke bygg frittstående repoer for hver klient.

## Prinsipp for dataflyt

```text
Admin / Mobile / Desktop ── HTTPS ── Node.js API ── PostgreSQL
                                       │
                                    Worker ── RabbitMQ ── Wi-Fi/ESP32
                                       │                        │
                                    KI/Mime                  BLE-signal
                                                                │
                                                       Mobile / Desktop
```

ESP32 sender primært en **stabil identifikator**, ikke tilbudstekst eller persondata. Appen slår opp identifikatoren via API og får gjeldende innhold og eventuelle romtjenester. Wi-Fi/RabbitMQ brukes til sentral kontroll (enable/disable, sendeparametre, config-versjon, health/heartbeat og på sikt sikker firmwareoppdatering). Klienter får ikke RabbitMQ-tilgang. Ikke bruk beacon-ID som bevis på identitet eller autorisasjon.

## Hovedfunksjoner og brukerreiser

| Funksjon | Atferd |
| --- | --- |
| Klasseromveiledning | Bruker velger menyvalg; app søker aktivt etter utstyrs-/rombeacon ved lærerpulten og viser riktig romside med utstyr, manualer, bilder og KI-hjelp. |
| Offline-fallback | Bruker skriver inn romnummer eller velger campus/bygg/rom; samme romside og tjenester vises uten beacon/Bluetooth. |
| Driftsavvik | IT oppdaterer avvik på rom/utstyr; romsiden viser status og midlertidig alternativ. Mime får samme oppdaterte informasjon. Eksisterende sak kan kobles inn. |
| Lokale meldinger | Admin setter sted, kategori, prioritet, start/slutt, melding, handling og lenke; eksempel workshop i læringslabben eller tilbud i kantina. |
| Flere samtidige beacons | Klient filtrerer på type og stabiliserer RSSI over flere målinger, bruker hysterese; prioriterer relevant innhold eller gir valg ved usikkert romtreff. RSSI er ikke eksakt avstand. |
| Varslingskontroll | Opt-in per kategori, unike publikasjoner, tidsvindu, deduplisering, nedkjøling, «ikke vis igjen». Manuelle oppslag påvirkes ikke. |
| Mobil + desktop | Begge klienter benytter Entra ID, samme API, samme rom- og innholdsmodell; desktop kan ligge diskret i menylinje/systemstatusfelt. |
| KI/Mime | Åpne KI med autorisert og eksplisitt begrenset sted-/romkontekst; svar bygger på registrert utstyr, manual og gjeldende avvik. Vanlig manual fungerer når KI ikke gjør det. |

## Autentisering og autorisasjon – Microsoft Entra ID

1. Avklar HVLs tenant, appregistreringer, eksponering av API-scopes, redirect-URI-er og institusjonelle krav med identitetsforvalter. Ikke legg hemmeligheter i mobil/desktop.
2. Bruk OIDC/OAuth Authorization Code + PKCE via systemnettleser på mobil og desktop; web-admin følger sikker nettleser-/servermodell. Unngå embedded webview for innlogging. Tokenlagring gjøres med plattformens sikre mekanismer.
3. Node.js API validerer Entra access tokens korrekt og håndhever tilgang til både brukerdata og adminoperasjoner. Modellér student/ansatt som relevante applikasjonsroller/kontekst; skille autentisert bruker fra administrator/publisist/IT-redaktør.
4. Enhetsidentitet er separat fra menneskers Entra-pålogging. ESP32 får egne begrensede legitimasjoner og tilgang til egne MQTT-topics; enhetene er ikke Entra-brukere.
5. Feilkobling og fallback: uten Entra-pålogging kan appen eventuelt vise eksplisitt godkjent offentlig innhold, men aldri personlig timeplan, interne driftsdata eller administrasjon. Beslutning om anonym tilgang tas før implementasjon.

## Domenemodell – startpunkt i PostgreSQL

- **Campus, Building, Floor, Place, Room**: stabile ID-er; romnummer er bare unikt innen rett scope.
- **BeaconDevice, BeaconPlacement**: fysisk enhet og kobling til rom/sted holdes atskilt. Enhet kan byttes uten å miste historisk og aktiv rominformasjon.
- **Equipment, RoomEquipment, Guide**: romspesifikke installasjoner og versjonerte manualer/bilder.
- **Incident**: rom/utstyr, status, alvorlighet, gyldighet, alternativ fremgangsmåte, kilde og oppdateringstid.
- **ContentItem, Publication, PlacementRule**: melding, kategori, CTA, målområde, publisering, tidsrom og prioritet.
- **UserPreference**: samtykke/varslingskategorier; ikke sentral bevegelseshistorikk.
- **AuditEvent**: endring av enheter, veiledninger, avvik og publisering; ikke brukerens beacon-passeringer.
- **IntegrationRef**: eksterne ID-er der HVL-tjenester kobles inn.

Bruk migrasjoner og seed-data for pilot. Serveren avgjør aktivt tidsvindu i UTC; klienten viser lokal tid.

## BLE, bakgrunn og batteri – tidlig risikopunkt

Test på **fysiske iPhone- og Android-enheter**, med tillatelser, låst skjerm, OS-begrensninger, forskjellige sendestyrker, flere treff og batteri. Expo Go er ikke nok for native BLE. Skill OS-drevet bakgrunnsovervåking av et begrenset sett regioner fra tidsavgrenset aktiv scanning ved brukerhandling. Bakgrunnshendelser er ikke garantert i sanntid; appens verdi skal ikke kreve at de alltid ankommer. Valider også om Tauri kan bruke egnet native BLE på Windows/macOS uten kontinuerlig kostbar scanning. GPS/geofencing kan prøves som valgfri grov filtrering, ikke være et hardt krav.

## Varsling og personvern

Brukeren velger kategorier og kan slå av varsler. Ingen kampanje skal repeteres på hvert beacon-treff. Gi viktige rom-/driftsmeldinger prioritet foran generelle tilbud, men ikke omgå brukerens kategorivalg for kampanjer. Ikke lag sentral bevegelseshistorikk som standard; behandle RSSI lokalt når mulig. Gjennomfør nødvendig personvern-/sikkerhetsvurdering og få godkjent ESP32 på institusjonens nett før pilot. Varsler over BLE er **ikke** kanal for sikkerhetskritisk nødinformasjon.

## Admin og enhetsdrift

Admin skal kunne opprette/redigere campus, sted og rom; koble enhet til rom; vedlikeholde utstyr og manualer; registrere avvik; publisere tids-/stedsbestemt innhold; sette prioritet; stanse publisering; se enheter online/offline. Logg administrative endringer. Bruk designsystemet.no der relevant. Enhetskommandoer bør være idempotente og versjonerte, med reconnect, heartbeat og begrensede per-enhet-legitimasjoner.

## Leveranserekkefølge og akseptanse

**M0: Teknisk avklaring.** ESP32 BLE + Wi-Fi proof-of-concept; Expo development build med foreground og background på iOS/Android; Tauri BLE proof-of-concept; batteri-/RSSI-test; RabbitMQ MQTT-verifisering; Entra ID innloggingsskisse og test av tokenflyt.

**M1: Ende-til-ende rom.** Monorepo, lokal PostgreSQL/RabbitMQ, Entra ID innlogging, datamodell, API, admin for rom/utstyr, beaconoppslag, manual og manuell romsøk.

**M2: Operativ informasjon.** Registrere/oppdatere avvik i admin, visning i romside, tids-/stedsstyrt publisering, flere treff, antispam og kategorivalg.

**M3: KI og desktop.** HVL KI/Mime-adapter med kontrollert romkontekst, Tauri-klient med romveiledning og AI-inngang, robuste integrasjonskontrakter.

**M4: Pilot.** Enhetsdrift, kapsling/montasje, pilot i utvalgte rom + læringslab/kantine, måle batteri/pålitelighet/nytte og avklare utrulling.

**MVP er ferdig nok når:** En innlogget bruker får riktig rom/manual og aktivt driftsavvik med beacon **og** manuelt romnummer; admin endrer innhold uten ny app-build; tidsstyrt oppslag fungerer; samtidig beacon-treff ikke gir varslingsstorm; KI får kun godkjent romkontekst; offline-enhet blokkerer ingen hovedfunksjon. Begrensninger i bakgrunnsdeteksjon er dokumentert.

## Beslutninger som gjenstår

HVL tenant/appregistreringer og roller; kilde til romregister og driftsavvik; konkret BLE-bibliotek/format; metode for Tauri BLE; MQTT kontra bro; lagringspolicy og offentlig vs innlogget informasjon; drift i Kubernetes og observability. **Entra ID, Node.js, PostgreSQL, React Native/Expo, Tauri/React, React-admin og RabbitMQ er besluttet som ramme.**
