# ESP32-C3 SuperMini firmware: lokal mobiloppsett + periodisk HTTPS

**Pilotkoden er ikke fysisk kompilert eller validert ennå.** Åpne `Beacon/Beacon.ino` i Arduino IDE med Arduino-ESP32 3.3.7 og ArduinoJson 7. Kopier `BackendConfig.example.h` til `Beacon/BackendConfig.h`, og legg inn faktisk HTTPS API-URL og korrekt CA-sertifikat. Aldri bruk `setInsecure()`. Flash via USB-C.

Ved første oppstart starter ESP32 en WPA2-beskyttet midlertidig AP med SSID `HVL-INFO-<hardware suffix>`. AP-passord genereres tilfeldig én gang og skrives til **USB Serial Monitor**. Skriv det på etiketten eller ta det med i utleveringspakken før kabinettet lukkes. Koble mobilen til AP og åpne **http://192.168.4.1** (lokal HTTP kun på passordbeskyttet oppsettnett). Velg synlig 2,4 GHz SSID eller skriv skjult SSID, angi nettpassord, et visningsnavn og engangskoden fra Entra-beskyttet admin.

ESP32 kobler seg til valgt nett, sender maskinvare-ID, navn og engangskode over **verifisert HTTPS** og får en per-enhet-nøkkel og UUID/Major/Minor. Den starter iBeacon og slår av Wi-Fi etter synkroniseringen. BLE-annonsering fortsetter. Ved neste oppstart og deretter omtrent hver time kobler den kortvarig til Wi-Fi, sjekker ønsket konfigurasjon, rapporterer firmware/config og slår Wi-Fi av igjen. Nettfeil lar sist lagrede BLE-oppsett fortsette; deaktivert enhet slutter først å annonsere når den har mottatt beskjed ved neste synk. Polling er **ikke sanntidsstyring**.

Hold BOOT (GPIO9) i fem sekunder *etter normal oppstart* for nytt oppsett. Ikke hold knappen mens strøm settes på. For enheten med allerede brukt engangskode må admin lage en **ny** kode. Enheten lagrer Wi-Fi-passord og nøkkel i NVS; sikker produksjonsutrulling krever vurdering av flash encryption, fysisk beskyttelse, enhetsnett og legitimasjonsrotasjon.

**HVL Wi-Fi:** Firmware støtter nå 2,4 GHz WPA2-Personal/Open testnett, ikke eduroam/802.1X eller captive portal. Avtal en godkjent IoT-SSID og nettverkstilgang med IT. Telefonen må være på ESP32 sitt AP under lokal konfigurering, men trenger ikke Entra-login der. Admin krever Entra ID. Lokal setup-HTTP må aldri eksponeres på HVL-nettet.

**Ikke implementert:** OTA, automatisk etikett-/QR-generering, enterprise Wi-Fi, full credential rotation, hardening av lokalt oppsett. RabbitMQ er for andre backendjobber; ESP32 trenger ikke vedvarende MQTT-forbindelse.
