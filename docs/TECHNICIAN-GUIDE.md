# Teknikerveiledning: Registrere og sette opp en HVL Info-beacon

Denne veiledningen gjelder pilotløsningen med **ESP32-C3 SuperMini i nummerert kabinett**. Den beskriver både første oppsett og feilretting. Firmware, backend og admin må være klargjort og testet før enheten settes i ordinær drift på campus.

## Før du begynner

Du trenger en ESP32 med riktig firmware, USB-strøm, nummeret preget på kabinettet, en mobil, passordet til ESP32-ens lokale oppsettnett og tilgang til HVL Info Admin med riktig Entra-rolle. Nettverket enheten skal bruke senere må være et **godkjent 2,4 GHz IoT-nett** med tilgang til DNS, NTP og backend over HTTPS.

**Viktig:** Nåværende pilotfirmware støtter ikke eduroam/802.1X eller captive portal. Avklar en egnet SSID med IT. Ikke legg inn private eller felles campus-passord i admin.

AP-passordet er unikt for enheten og vises ved klargjøring på USB Serial Monitor. Det bør følge enheten i et kontrollert servicekort eller på en skjermet etikett. Nummeret på kabinettet er **ikke** AP-passord.

## 1. Registrer fysisk plassering i admin

1. Logg på HVL Info Admin med Entra ID.
2. Opprett eller finn riktig sted (campus, bygg og rom/område).
3. Under **Registrer fysisk beacon**, tast **kun nummeret på kabinettet**, for eksempel `42`.
4. Velg fysisk plassering og rolle. Kontroller at nummer og sted stemmer før registrering.
5. Admin oppretter intern enhets-ID og iBeacon-identitet (felles UUID + automatisk Major/Minor). Du skal **ikke** fylle inn MAC-adresse, UUID, Major eller Minor.

Hvis nummeret allerede er registrert: finn eksisterende post. Ikke opprett et nytt nummer for å omgå en konflikt.

## 2. Hent engangskode og åpne lokalt oppsett

1. Finn riktig enhet i **Enhetsoversikt** og velg **Engangskode**.
2. Koden vises bare én gang og varer i **15 minutter**. Noter den sikkert før du bytter mobilens Wi-Fi; telefonen mister normalt internett når den kobler seg til ESP32.
3. Koble ESP32 til USB-strøm. Ved første oppstart lager den et passordbeskyttet nett med navn som `HVL-INFO-A3B921`. Bokstavene kommer fra chipens hardware-ID, **ikke** det pregede kabinett-nummeret.
4. Koble mobilen til dette nettet med enhetens eget AP-passord. Meldingen «Ingen internettilgang» på mobilen er **forventet**: dette er bare en lokal forbindelse til ESP32.
5. Åpne `http://192.168.4.1` i nettleseren. Bruk **http**, ikke https, på dette lokale oppsettnettet.

Det midlertidige Wi-Fi-nettet videresender ikke internett. ESP32 får først internett **etter** at oppsettnettet er avsluttet og den har koblet seg til Wi-Fi-nettet du velger i neste trinn.

## 3. Velg ordinært Wi-Fi

1. På ESP32-siden: velg en synlig **2,4 GHz SSID** fra listen, eller skriv navnet manuelt hvis nettverket er skjult.
2. Skriv Wi-Fi-passordet og et forståelig visningsnavn, for eksempel `Lærerpult M204`.
3. Ved **første registrering**: skriv også inn engangskoden fra admin.
4. Velg **Ta i bruk**. ESP32 lagrer nettinnstillingene lokalt, lukker oppsettnettet og prøver å koble seg på valgt nett.
5. ESP32 kontakter Node.js-backend over sertifikatvalidert HTTPS. Backend binder chipen til det registrerte kabinett-nummeret og sender tilbake enhetsnøkkel samt UUID/Major/Minor. ESP32 starter BLE og sender en ekstra autentisert statusmelding.

Wi-Fi-passordet skal ikke lagres i HVL Info Admin. Vanlig drift er iBeacon over BLE mens Wi-Fi normalt er avslått; enheten kobler seg kort opp ved oppstart og omtrent hver time for å sjekke konfigurasjon og rapportere status.

## 4. Bekreft at installasjonen er i drift

1. Gå tilbake til ordinært Wi-Fi eller mobildata på telefonen, åpne admin og velg **Oppdater**.
2. Finn kabinett-nummeret. Sjekk at enheten har **Sist kontakt**, og at **rapportert konfigurasjon** er lik **ønsket konfigurasjon**.
3. Bekreft fysisk plassering og bruk en BLE-skanner, for eksempel nRF Connect, til å kontrollere UUID/Major/Minor nær den aktuelle enheten.
4. Velg **Bekreft i drift**. Knappen åpnes først etter innrullering og en autentisert check-in **de siste 15 minuttene** med gjeldende konfigurasjonsversjon.

Admin lagrer tidspunkt og hvem som bekreftet. «Bekreftet i drift» er en **installasjonsbekreftelse**, ikke kontinuerlig dokumentasjon på at radioen sender. «Sist kontakt» gjelder kortvarige Wi-Fi-økter.

## 5. Feilretting uten å slette identiteten

| Symptom | Hva teknikeren gjør |
| --- | --- |
| Enheten starter ikke | Sjekk USB-strøm, kabel og strømforsyning. Trykk **RESET alene** for vanlig omstart. |
| ESP32s Wi-Fi vises ikke | Vent på normal oppstart; hold **BOOT alene i fem sekunder** etter oppstart. Sjekk AP-navnet og passordet fra servicekort/Serial Monitor. |
| Telefonen sier «Ingen internettilgang» | Det er normalt på ESP32s midlertidige oppsettnett. Behold forbindelsen og åpne `http://192.168.4.1`. |
| Oppsettsiden åpnes ikke | Sjekk at mobilen faktisk er koblet til `HVL-INFO-...`, ikke byttet til mobildata/annet Wi-Fi. Tast adressen manuelt med `http://`. |
| Riktig ordinært Wi-Fi mangler i listen | Sjekk 2,4 GHz-dekning. Skjult SSID kan skrives manuelt. eduroam/802.1X støttes ikke i piloten. |
| Feil Wi-Fi-passord eller nytt nett | Hold **BOOT alene i fem sekunder etter oppstart**, åpne portalen igjen og korriger Wi-Fi. **Ikke** registrer en ny inventarenhet. |
| Engangskoden er utløpt eller brukt | Lag ny kode i admin **for samme kabinett-nummer**. Førstegangsregistrering trenger kode; endring av Wi-Fi på allerede innrullert chip gjør ikke det. |
| Enheten vises ikke som klar i admin | Trykk **Oppdater**. Sjekk at riktig nett har internett og tilgang til backend, DNS og NTP. Sjekk også at ønsket og rapportert konfigurasjon stemmer. |
| Ingen BLE oppdages | Sjekk strøm og at enheten er registrert, ikke deaktivert. Kontroller fysisk avstand/antenneplassering og test med BLE-skanner. Ikke trykk «Bekreft i drift» uten å observere riktig identitet. |
| Feil rom eller feil kabinett-nummer | Ikke bekreft. Rett opp inventar/plassering via autorisert administrasjonsflyt; ikke overta en annen chips identitet med en ny kode. |

**BOOT + RESET er ikke feilrettingskombinasjonen.** Hvis BOOT holdes inne samtidig med RESET eller ved påslag, kan ESP32-C3 starte ROM-modus for firmware-nedlasting. Slipp BOOT og trykk RESET alene. BOOT etter **normal** oppstart åpner vår lokale oppsettsportal.

**Ikke fabrikktilbakestill ved vanlig Wi-Fi-feil.** Recovery via BOOT skal bevare chipbinding, enhetsnøkkel og siste godkjente iBeacon-konfigurasjon. Ved fysisk defekt chip eller nødvendig nøkkelrotasjon må IT følge en separat, autorisert erstatningsprosedyre; den er ikke ferdig implementert i piloten.

## 6. Når det fortsatt ikke virker

Noter **nummeret på kabinettet**, stedet, tidspunktet for forsøket, hva admin viser under «Sist kontakt» og ønsket/rapportert konfigurasjon, om lokal portal er tilgjengelig, og om BLE-signalet observeres. Del opplysningene med IT/drift.

**Ikke send** Wi-Fi-passord, engangskoder, AP-passord eller enhetsnøkkel i ordinære supportsaker eller skjermbilder.

Hvis en beacon må slutte å sende **umiddelbart**, koble fra USB-strømmen. «Deaktiver» i admin stopper backend-oppslag straks, men en enhet uten nett kan fremdeles sende BLE frem til neste vellykkede sjekk.
