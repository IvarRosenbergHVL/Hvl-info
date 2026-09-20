# ESP32-C3 SuperMini firmware: lokal mobiloppsett + periodisk HTTPS

**Pilotkoden er ikke fysisk kompilert eller validert ennå.** Åpne `Beacon/Beacon.ino` i Arduino IDE med Arduino-ESP32 3.3.7 og ArduinoJson 7. Kopier `BackendConfig.example.h` til `Beacon/BackendConfig.h`, og legg inn faktisk HTTPS API-URL og korrekt CA-sertifikat. Aldri bruk `setInsecure()`. Flash via USB-C.

Ved første oppstart starter ESP32 en WPA2-beskyttet midlertidig AP med SSID `HVL-INFO-<hardware suffix>`. AP-passord genereres tilfeldig én gang og skrives til **USB Serial Monitor**. Skriv det på etiketten eller ta det med i utleveringspakken før kabinettet lukkes. Koble mobilen til AP og åpne **http://192.168.4.1** (lokal HTTP kun på passordbeskyttet oppsettnett). Velg synlig 2,4 GHz SSID eller skriv skjult SSID, angi nettpassord, et visningsnavn og engangskoden fra Entra-beskyttet admin.

ESP32 kobler seg til valgt nett, sender maskinvare-ID, navn og engangskode over **verifisert HTTPS** og får en per-enhet-nøkkel og UUID/Major/Minor. Den starter iBeacon og slår av Wi-Fi etter synkroniseringen. BLE-annonsering fortsetter. Ved neste oppstart og deretter omtrent hver time kobler den kortvarig til Wi-Fi, sjekker ønsket konfigurasjon, rapporterer firmware/config og slår Wi-Fi av igjen. Nettfeil lar sist lagrede BLE-oppsett fortsette; deaktivert enhet slutter først å annonsere når den har mottatt beskjed ved neste synk. Polling er **ikke sanntidsstyring**.

**Feilretting:** Trykk RESET én gang for normal restart. Hvis Wi-Fi ikke fungerer: vent til normal oppstart er fullført, og hold **BOOT alene i 5 sekunder**. Koble mobilen til enhetens lokale, passordbeskyttede oppsettnett, åpne `http://192.168.4.1` og velg et annet nett / oppdater passord. Det kreves **ikke ny engangskode** når enheten allerede er innrullert. Chipbinding, device key og tidligere BLE-konfigurasjon beholdes. Ved første gangs oppsett trengs fortsatt engangskode fra admin.

Ikke hold BOOT under påslag eller sammen med RESET/EN: BOOT på GPIO9 lav under reset starter ESP32-C3 sin ROM-nedlastingsmodus, ikke oppsettsportalen. Hvis det skjer, slipp BOOT og trykk RESET alene. <br>

Når enheten allerede har gyldig BLE-konfigurasjon, forsøker firmwaren å beholde den under nettverksfeil og mens lokal portal er åpen (reell Wi-Fi/BLE-samdrift må prøves på fysisk kort). Et forsøk på nytt Wi-Fi med feil passord skal ikke automatisk slette device key og kreve registrering av en ny chip. Enheten lagrer Wi-Fi-passord og nøkkel i NVS; sikker produksjonsutrulling krever vurdering av flash encryption, fysisk beskyttelse, enhetsnett og legitimasjonsrotasjon.

**HVL Wi-Fi:** Firmware støtter nå 2,4 GHz WPA2-Personal/Open testnett, ikke eduroam/802.1X eller captive portal. Avtal en godkjent IoT-SSID og nettverkstilgang med IT. Telefonen må være på ESP32 sitt AP under lokal konfigurering, men trenger ikke Entra-login der. Admin krever Entra ID. Lokal setup-HTTP må aldri eksponeres på HVL-nettet.

**Ikke implementert:** OTA, automatisk etikett-/QR-generering, enterprise Wi-Fi, full credential rotation, hardening av lokalt oppsett. RabbitMQ er for andre backendjobber; ESP32 trenger ikke vedvarende MQTT-forbindelse.

**Bekreftelse etter første oppsett:** Etter at engangskoden er innløst og BLE-konfig er lagret/startet, sender firmwaren én ekstra autentisert check-in straks. Først når admin ser denne med gjeldende config-versjon og teknikeren observerer korrekt beacon på stedet, kan den bekreftes som i drift. Senere Wi-Fi-synk følger fortsatt omtrent én gang i timen.
