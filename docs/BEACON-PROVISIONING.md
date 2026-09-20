# Registrering og utplassering av ESP32-beacons

**Status:** Design for MVP. Dette er planlagte arbeidsflyter og kontrakter, ikke implementert funksjonalitet.

## Målet

En IT-/driftsmedarbeider skal kunne ta en ny ESP32-C3 SuperMini fra esken, registrere den i HVL Info, montere den ved en lokasjon og se at den faktisk er på nett og sender riktig BLE-identitet. Systemet må også kunne flytte, erstatte, deaktivere og avregistrere fysiske enheter uten at rommanualer eller innhold forsvinner.

**Skill mellom tre ting:**

- `BeaconDevice`: fysisk ESP32 med unik enhets-ID og separat enhetslegitimasjon.
- `BeaconPlacement`: hvilken campus/bygning/etasje/sted/rom den er plassert ved og fra når.
- `BeaconIdentity`: BLE-identiteten og annonseringsinnstillingene klientene oppdager. Denne knyttes til *stedet* gjennom aktiv plassering, men enheten kan byttes uavhengig.

En beacon er ikke en bruker og skal aldri autentiseres som en ansatt i Entra ID. Teknikeren logger inn i **admin** med Entra ID og rett rolle.

## MVP: registrering og fysisk idriftsetting

1. **Opprett enhet i admin.** Velg «Legg til ESP32»; skriv inn eller skann enhetens serienummer/produksjons-ID, valgfritt inventarnummer og notat. Systemet lager intern UUID og status `pending`. Ingen enhet får lov til å ta over en eksisterende enhets-ID.
2. **Tilordne et sted.** Velg campus → bygg → etasje → rom/sted og velg rolle, for eksempel `classroom_equipment` ved lærerpulten, `area` for læringslabben eller `service` for kantina. Romdata eies av sted/rom, ikke av enheten.
3. **Klargjør enheten lokalt.** Flash felles firmware; klargjør Wi-Fi på en kontrollert måte (for MVP: USB/serial-verktøy hos IT). Vis en **kortlivet, engangs provisioning-kode** bare til autorisert tekniker. Ikke hardkod felles MQTT-passord i firmware eller putt legitimasjon i offentlig QR-kode, BLE-annonsen eller repoet.
4. **Aktiver sikker enhetsidentitet.** Enheten utveksler engangskoden med backend via HTTPS/TLS, oppgir sin stabile hardware-ID, får begrenset enhetslegitimasjon og ønsket konfigurasjonsversjon. Backend merker koden brukt; gjenbruk avvises. Velg sikker oppbevaring som plattformen støtter; vurder fysisk trusselmodell for ESP32 før bred utrulling.
5. **Koble til broker.** ESP32 bruker Wi-Fi og MQTT over TLS mot RabbitMQ MQTT-plugin (eller dokumentert bro). Per-enhet tilgang begrenses til egne kommando- og status-topics. Backend sender versjonert `desired`-konfigurasjon (BLE-format/ID, enable, Tx power, advertising interval); ESP32 kvitterer `reported`-versjon og starter annonsering.
6. **Bekreft installasjon.** Admin viser siste heartbeat, firmware, ønsket/rapportert konfigurasjon, status og valgt rom. Teknikeren bruker «Test beacon» i mobilen/desktop på stedet og ser riktig lokasjon. Før dette er enheten ikke `active`.
7. **Merk og monter.** Printet kabinett/etikett kan ha offentlig enhets-ID/QR for raskt oppslag i admin, men **ingen hemmeligheter**. Registrer monteringspunkt, USB-strømkilde, dato og eventuelt bilde.

**Fallback:** Hvis Wi-Fi eller RabbitMQ er nede, kan en allerede konfigurert enhet fortsette å sende sist godkjente BLE-identitet så lenge den har strøm; den vises som `offline` etter utløpt heartbeat. Appens manuelle romsøk fungerer også om selve beaconen er nede. Hvis lokasjon er endret og gammel konfigurasjon ikke lenger er gyldig, må gammel enhet deaktivere annonsering så snart den mottar kommando; gi admin synlig advarsel inntil kvittering. Ikke anta at offline enhet kan fjernstanses.

## Admin – oversikt og enhetsdetaljer

**Liste:** Enhets-ID/etikett, campus/bygg/rom, beacon-rolle, enhetsstatus, heartbeat, firmware, config ønsket/rapportert, BLE-ID, Wi-Fi-signal hvis tilgjengelig, sist endret av. Filtrer på sted, status og «ikke utplassert». Vis offline uten å forveksle manglende telemetri med bekreftet stoppet BLE.

**Handlinger:** Legg til · Klargjør/provisioner · Plasser · Bekreft test · Flytt · Bytt fysisk enhet · Endre BLE-parametre · Pause/aktiver · Roter legitimasjon · Deaktiver/trekk tilbake · Vis audit.

**Flytt/bytt:** Lukk aktiv `BeaconPlacement`, opprett ny historisk kobling med effektiv dato. Behold rom/manualer/avvik/innhold på `Place/Room`. Ved bytte kan ny ESP32 overta stedets konfigurasjon; den gamle mister tilgang og skal deaktiveres fysisk hvis den er offline. Ikke gjenbruk samme innloggingshemmelighet.

## Minimum datamodell (PostgreSQL)

| Entitet | Sentrale felter |
| --- | --- |
| `BeaconDevice` | id UUID, serial/hardware_id unik, asset_tag, model, firmware_version, state, last_seen_at, provisioned_at, revoked_at |
| `BeaconPlacement` | id, device_id, place_id/room_id, role, mounted_at, removed_at, note, mounted_by; maks én aktiv plassering per fysisk enhet |
| `BeaconIdentity` | id, device_id eller aktiv plassering, beacon_format, namespace/UUID, major/minor eller alternativ ID, tx_power, interval_ms, enabled, config_version |
| `DeviceCredential` | device_id, credential reference, status, created_at, rotated_at, revoked_at; hemmeligheter aldri i klartekst i generell logg/audit |
| `DeviceProvisioningToken` | hashed token, device_id, expires_at, consumed_at, issued_by; engangs og tidsbegrenset |
| `DeviceHeartbeat` (begrenset historikk) | device_id, timestamp, firmware, reported config, connectivity/health |
| `AuditEvent` | Entra-bruker, handling, objekt, tidligere/nytt sted, tidspunkt; ikke studenters nærhetshistorikk |

Datamodell og beacon-format må testes mot iOS-bakgrunnsoppdagelse før de fryses. Ikke bruk serienummer alene som hemmelig autentisering.

## API og device-meldinger – forslag

- `POST /admin/devices`, `GET /admin/devices`, `GET /admin/devices/:id`
- `POST /admin/devices/:id/provisioning-token` (kort gyldighet og rollekrav)
- `POST /device/provision` (TLS, engangskode + forventet fysisk ID)
- `POST /admin/devices/:id/placements`, `POST /admin/devices/:id/deactivate`
- `PATCH /admin/devices/:id/config`, `POST /admin/devices/:id/revoke`
- `desired`/ `reported`-config og status/heartbeat over egne MQTT-topics med broker-ACL

Avklar konkret API-kontrakt og håndtering av credentials i implementasjons-issue; endepunktene over er designskisser.

## Akseptansekriterier – første pilot

- [ ] Ny SuperMini kan registreres via Entra-beskyttet admin og få unik identitet.
- [ ] Tekniker kan koble den til et rom, klargjøre Wi-Fi og aktivere med én gangs kode.
- [ ] Enhet annonserer tildelt BLE-identitet, rapporterer heartbeat/config-versjon, og kan finnes fra telefon på stedet.
- [ ] En uregistrert/enhet med tilbakekalt legitimasjon får ikke MQTT-tilgang; en kassert engangskode kan ikke gjenbrukes.
- [ ] Admin skiller `pending`, `provisioned`, `active`, `offline`, `deactivated` og `revoked` (og viser hvorvidt BLE faktisk er verifisert).
- [ ] Enhet kan flyttes eller erstattes uten at rommanualer, avvik og publikasjoner flyttes med.
- [ ] Tapt Wi-Fi gir synlig offline-status; manuell romsøk fungerer fortsatt.
- [ ] Etikett/QR viser bare offentlig identifikator, ikke provisioning-token eller Wi-Fi-/MQTT-hemmeligheter.
- [ ] Ingen sentral logg over hvilke studenter som passerte en beacon.
