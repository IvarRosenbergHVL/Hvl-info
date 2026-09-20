# Implementeringsstatus – ESP32-oppsett og admin

| Område | Status |
| --- | --- |
| Node.js API | Entra-basert admin, places, device registry, iBeacon ID, én-gangs innrullering og periodisk HTTPS check-in kodet |
| PostgreSQL | Migrasjon 002 med engangstoken-hash, individuell enhetsnøkkel-hash, navn, siste sjekk og config-versjon |
| React admin | Vite/React + MSAL, registrer rom, ESP32, plassering og UUID/Major/Minor, generer engangskode, vis siste synk, manuell bekreftelse |
| ESP32-C3 | Arduino-skisse med passordbeskyttet lokal AP/HTTP-webportal, SSID-liste, navn, innrullering over CA-validert HTTPS, iBeacon og periodisk Wi-Fi |
| RabbitMQ | Tilgjengelig for backend-jobber, ikke nødvendig som vedvarende ESP32-tilkobling |
| Expo / Tauri / Mime | Fortsatt planlagt |
| Teststatus | Ikke verifisert kompilering, oppkobling mot PostgreSQL/Entra, faktisk HTTPS eller fysisk ESP32 |

Dette er pilotkode. Klargjør HTTPS-sertifikat, API-URL, Entra appregistrering, godkjent IoT-SSID og AP-etikett før bruk. ESP32 støtter per nå ikke eduroam/802.1X. Deaktivering er ikke øyeblikkelig ved sjelden polling; koble fra strøm hvis enhet må stoppe straks. Ingen GitHub Actions.
