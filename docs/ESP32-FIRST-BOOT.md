# ESP32 førsteoppsett: mobilportal og periodisk nett

Dette er beslutningen for **MVP**: ESP32-C3 er først og fremst en **lokal iBeacon-sender**. Den trenger ikke være kontinuerlig på Wi-Fi eller MQTT. En kort HTTPS-økt ved installasjon, oppstart og deretter ca. hver time er tilstrekkelig for normalt innhold og konfigurasjon.

## Brukerflyt
1. IT oppretter fysisk enhet i Entra-beskyttet React-admin. Registrer maskinvare-ID, navn, rolle, sted og tildel unik UUID/Major/Minor. Romnummer og manualer forblir på stedet.
2. IT lager en **15 minutters engangskode** for registrert, plassert enhet.
3. Ved første oppstart sender ESP32 et **passordbeskyttet lokalt Wi-Fi**: `HVL-INFO-<siste-tegn-i-maskinvare-ID>`. Passordet genereres per enhet og skrives ut på USB-serial ved klargjøring; merk det i utleveringspakken før kapslingen lukkes. Ikke bruk åpent eller felles standard-AP-passord.
4. Teknikeren kobler mobilen til det midlertidige Wi-Fi-nettet og åpner `http://192.168.4.1`. Lokal portal viser 2,4 GHz-nettverk oppdaget av ESP32; manuell SSID fungerer ved skjult nett. Bruker skriver inn eget displaynavn, Wi-Fi-passord og engangskode fra admin.
5. ESP32 lagrer Wi-Fi i lokal NVS og lukker setup-AP; bruker deretter valgt internettforbindelse for å kontakte backend **over sertifikatvalidert HTTPS**. Backend verifiserer engangskode, forventet hardware-ID, eksisterende plassering og iBeacon-identitet, og gir en egen tilfeldig enhetsnøkkel og ønsket BLE-konfigurasjon. Engangskode blir ugyldig.
6. ESP32 starter iBeacon med backendtildelt identitet. Mobil/desktop kan slå opp identiteten via vanlig bruker-API. IT tester på stedet (f.eks. med nRF Connect) og markerer fysisk bekreftet i admin. Etter det trenger ikke ESP32 å kjenne innhold/tilbud/rommanualer – bare sin offentlige BLE-identitet.
7. ESP32 slår av Wi-Fi og fortsetter BLE. Ved senere oppstart og omtrent hver time kobler den seg kort til Wi-Fi, sender status/firmware/rapportert konfigurasjonsversjon og henter aktuell konfigurasjon. Ingen sentral logg om personer som passerer.

## Ikke sanntid; viktig konsekvens

Innhold, workshops og avvik lagres og publiseres i backend, og mobilappen henter dette **når beacon er oppdaget**. ESP32 trenger ikke oppdateres når noen endrer et tilbud eller en manual. Det er bare ved endret BLE-ID, sendestyrke, annonseringsintervall, pause/aktivering eller firmwareoppdatering at ESP32 må motta ny konfigurasjon.

«Deaktiver i registeret» filtrerer straks backend-oppslag, men ESP32 kan fortsette å sende BLE frem til neste vellykkede nettøkt. Ved behov for øyeblikkelig stopp må enheten kobles fra strøm/innhentes. Vis «sist sett» og «rapportert konfigurasjon» tydelig i admin; online/offline er ikke bevis på BLE-status.

RabbitMQ beholdes for backend-jobber, eventuelle hendelser og senere enhetsscenarier som faktisk trenger push. Ingen vedvarende MQTT-forbindelse kreves for den batterisparende ESP32-MVP-en.

## Nettverk og sikkerhet

- Enheten trenger fungerende NTP for TLS-sertifikatvalidering ved første boot; avklar DNS, utgående HTTPS og NTP i IoT-nettet. Hvis klokken ikke kan synkroniseres, skal den ikke sende engangskode eller device key.
- ESP32-C3 støtter bare 2,4 GHz. Pilotfirmware støtter WPA2-Personal eller åpent testnett; ikke anta at dette kan kobles direkte på **eduroam/802.1X**, captive portal eller et hvilket som helst HVL-SSID. Avklar et separat, godkjent, segmentert IoT-nett med IT før campus-pilot.
- Lokal HTTP finnes bare på passordbeskyttet setup-AP; aldri eksponer portalen på campus Wi-Fi. Når telefonen bruker enhetens AP, kan mobilen melde «ingen internett» — behold tilkoblingen til konfigurasjon er lagret.
- Engangskode og enhetsnøkkel må bare sendes videre over validerbar HTTPS med riktig CA og host. Ikke bruk `setInsecure()`; backend må publiseres på en HTTPS-adresse som enheten kan nå.
- Per-enhet-nøkkel lagres som hash sentralt, rånøkkel bare på ESP32. NVS i pilot er **ikke** tilstrekkelig beskyttelse mot fysisk uthenting; flash encryption, secure boot, rotasjon og revokering må avklares for utrulling.
- Sett opp en fysisk etikett/provisioning-kort med unik AP-SSID/passord. MAC/hardware-ID er offentlig identifikator, ikke autentisering.
- Reset via BOOT (hold 5 sekunder etter vanlig oppstart) åpner setup igjen og sletter lokal nøkkel. Ny engangskode kreves for registrering på nytt.

## Pilotens verifikasjon

- Entra-rolle og tildeling kreves for å registrere og gi engangskode.
- Uregistrert hardware-ID, feil/utløpt/brukt engangskode eller tilbakekalt enhetsnøkkel avvises.
- Lokal oppsettside viser SSID-liste og lar bruker velge nett og navn.
- Etter første tilkobling sender enheten registrert UUID/Major/Minor.
- Wi-Fi er avslått mellom sjekkene mens BLE fortsetter.
- Feil nett/backend beholder sist gyldige beacon-oppsett og retry etter kortere intervall.
- Endret innhold vises uten at ESP32 må koble seg til.
- Admin viser sist synk og ønsket/rapportert versjon uten å love umiddelbar fjernstopp.

### Implementeringsstatus
React-admin og firmwareportal er **skrevet, ikke ennå testet mot fysisk enhet/HVL tenant/nett**. API-endepunktene for én gangs registrering og periodisk HTTPS-sjekk er lagt inn, men krever Entra- og TLS-konfigurasjon før bruk.
