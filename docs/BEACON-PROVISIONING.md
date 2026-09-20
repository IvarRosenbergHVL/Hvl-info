# Registrering og utplassering av ESP32-C3-beacons

**Implementering:** Første Entra-beskyttede React-admin, API med engangskoder/individuelle enhetsnøkler, ESP32 lokal webportal og periodisk HTTPS-sjekk er kodet. Ikke validert på faktisk SuperMini/HVL-nett/Entra ennå. Se [ESP32-FIRST-BOOT.md](ESP32-FIRST-BOOT.md) og [implementeringsstatus](IMPLEMENTATION-STATUS.md).

## Hva IT gjør

1. Registrer et sted (campus, bygg, rom/område) i admin.
2. Registrer ESP32 med offentlig hardware-ID og beskrivende navn (f.eks. «Lærerpult M204»). Tilordne rom/område, rolle og unik iBeacon UUID/Major/Minor. BLE-pakken sender **ikke tekstnavn eller romnummer**. Appen slår opp disse via API.
3. Flash pilotfirmware via USB og klargjør etikett med lokalt AP-passord fra serial-utskriften. Ved første boot: enhetens passordbeskyttede midlertidige Wi-Fi er `HVL-INFO-...`.
4. Utsted engangskode i Entra-admin (15 minutter), koble telefonen til enhetens AP, åpne `http://192.168.4.1`; velg nettverk fra skannet liste eller skriv skjult SSID, legg inn Wi-Fi-passord, navn og engangskode.
5. ESP32 kobler seg på et **IT-godkjent, 2,4 GHz IoT-nett** (pilot: WPA2-Personal), registreres hos Node.js API via verifisert HTTPS, mottar en unik device key og BLE-konfigurasjon. Engangskode forbrukes og kan ikke brukes på nytt.
6. ESP32 starter BLE og slår av Wi-Fi. Teknikeren verifiserer UUID/Major/Minor på stedet med nRF Connect og markerer aktiv i admin. Deretter kobler enheten seg kort på Wi-Fi ved oppstart og ca. hver time for status og ønsket konfigurasjon.
7. Fysisk enhet, aktiv plassering og BLE-identitet ligger separat. Rommets manualer, utstyr, hendelser og publikasjoner ligger på stedet. Bytte av enhet skal ikke flytte innhold.

## Følg opp endringer

Vanlige oppdateringer av meldinger, tilbud, kurs, rommanualer eller aktive driftsavvik krever **ingen Wi-Fi-oppkobling fra ESP32**. Mobil/desktop henter innhold fra API via beaconens offentlige identitet. Endring av BLE-ID, sendestyrke, oppsett eller deaktivert sender blir først synlig på fysisk enhet ved neste vellykkede HTTPS-sjekk.

Når admin deaktiverer enhet, filtrerer API-et straks beaconoppslag, men en offline enhet kan fortsette å sende gamle BLE-signaler. **Koble fra strømmen ved behov for umiddelbar stans.** «Sist sett» betyr siste nettøkt, ikke kontinuerlig online-status.

## Sikkerhet, begrensninger og videre arbeid

- Entra ID gjelder mennesker/admin. ESP32 har egen identitet og en tilfeldig enhetsnøkkel; bare hash lagres sentralt.
- Oppsettssiden er lokal HTTP kun over passordbeskyttet AP, aldri tilgjengelig på campus-nettet. Backend-kall krever verifisert HTTPS.
- Firmware støtter nå 2,4 GHz WPA2-Personal/Open testnett, **ikke eduroam, 802.1X eller captive portal**. Enheten må få en godkjent IoT-SSID og utgående HTTPS hos HVL.
- NVS i pilot er ikke nok for produksjon: flash encryption, secure boot, credential rotation, fysisk sikkerhet og QR/etikettprosess gjenstår.
- Enhetens engangskode kan regenereres av admin; for gjenoppsett holdes BOOT i 5 sekunder *etter* oppstart. Den gamle innrulleringen må håndteres/tilbakekalles etter behov.
- RabbitMQ beholdes for backend-jobber, ikke for kontinuerlig kommunikasjon med hver ESP32.
- ESP32/firmware samler ikke brukerpasseringer. Ingen sentral personsporing.

## Aktuelle endepunkter

`POST /api/admin/devices`, `POST /api/admin/devices/:id/placement`, `PUT /api/admin/devices/:id/ibeacon`, `POST /api/admin/devices/:id/enrollment`, `POST /device/provision`, `POST /device/check-in`, `POST /api/admin/devices/:id/confirm`, `POST /api/admin/devices/:id/disable`.

Se [apps/api/README.md](../apps/api/README.md) for lokal oppstart. Ingen GitHub Actions.
