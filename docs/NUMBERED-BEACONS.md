# Nummererte fysiske beacons – registrering uten tekniske ID-er

**Beslutning:** ESP32-C3-enhetene monteres i 3D-printede kabinetter med et synlig nummer preget inn i plasten fra 1 og oppover, eksempelvis **42**. Dette nummeret er inventarnummer og det eneste en tekniker behøver å taste for å opprette enheten i admin. Samme nummer skal ikke forveksles med iBeacon Major/Minor, chipens maskinvare-ID eller en sikkerhetskode.

## Enklere feltflyt

1. Teknikeren monterer enhet med «42» i rom M204 og åpner Entra-beskyttet admin.
2. Registrer **nummer 42**, velg campus/bygg/rom og rollen «Klasseromutstyr». Ingen MAC, UUID, Major eller Minor skal tastes. Registreringen er atomisk: inventarpost + plassering + BLE-identitet, eller ingen av delene.
3. Backend lager `device_id` (intern UUID), bruker en felles HVL iBeacon UUID og allokerer neste unike Major/Minor-par fra PostgreSQL-sekvens. `inventory_number` er unikt; duplikatnummer avvises.
4. Tekniker genererer 15 minutters engangskode i admin for **inventar 42**.
5. ESP32 starter passordbeskyttet midlertidig Wi-Fi ved første boot. Teknikeren velger 2,4 GHz-nettverk og valgfritt visningsnavn på lokal oppsettside og legger inn engangskoden. Enheten sender **sin egen maskinvare-ID** over sertifikatvalidert HTTPS til Node.js.
6. Backend låser registreringen, forbruker koden og binder maskinvare-ID til akkurat inventar 42 dersom den ennå er ubundet. Ved gjenoppsett av samme inventar må ID matche; en annen chip kan ikke stilltiende overta nummeret. Enhetsnøkkel og UUID/Major/Minor returneres, og ESP32 starter annonsering.
7. Appen slår opp iBeacon-ID i backend og ser sted/utstyr. Manualer og meldinger ligger på stedet og forsvinner ikke om fysisk chip byttes.

Enhetsnummeret er offentlig, og en person som bare kjenner nummer 42 kan ikke registrere seg: det kreves en kortlivet engangskode utstedt fra Entra-admin. Men koden kan brukes av **første chip som får tak i den**, så teknikeren må være til stede under paring, og feil chip kan ikke behandles som en bekreftet hardware-attestasjon. Ved chipbytte må administrator eksplisitt frikoble/erstatte fysisk hardware-ID og trekke tilbake gammel enhetsnøkkel – **ikke** omgå bindingen automatisk. Enheten kan fremdeles deaktiveres i backend, og umiddelbar fysisk stopp krever at strømmen trekkes.

## Database og kompatibilitet

- `beacon_devices.inventory_number`: unikt positivt heltall for nye kabinetter; ikke en teknisk ID.
- `beacon_devices.hardware_id`: nullable fram til første innrullering, deretter bundet til chip.
- `beacon_devices.id`: intern UUID, ikke skrevet på kabinettet.
- `beacon_identities`: felles UUID + automatisk tildelt Major/Minor, en unik kombinasjon per enhet.
- Historiske manuelt opprettede poster bevares uten gjetting av fysiske inventarnummer og må avstemmes særskilt.
- Backendens tildeling bruker sekvens og databasesperrer/unike indekser. Nummer 42 er **ikke automatisk** Minor 42; det er to uavhengige nummerrom.

## Ikke ferdig ennå

Fysisk kompilering/flash og ekte Entra-/PostgreSQL-tester, automatisk QR-/etikettproduksjon og administratorflyt for eksplisitt hardwarebytte gjenstår. Et eget kort med AP-passord eller en beskyttet QR på kabinettets underside kan gjøre mobiloppsettet enklere; synlig nummer skal ikke brukes som AP-passord.

## Avslutt utplasseringen: teknikerbekreftelse

Før «Bekreft i drift» blir tilgjengelig må enheten være registrert, ha en plassering, være provisionert og ha sendt en **autentisert HTTPS check-in de siste 15 minuttene** med `reported_version = config_version`. Firmwaren gjør en ekstra check-in umiddelbart etter første innrullering, så teknikeren behøver ikke vente til neste timesintervall.

Teknikeren sammenligner det fysiske nummeret på kabinettet, stedet og UUID/Major/Minor som observeres med mobilen (f.eks. nRF Connect). Knappen «Bekreft i drift» registrerer tidspunkt, Entra-aktør og konfigurasjonsversjon. Det er en manuell fysisk bekreftelse, **ikke kontinuerlig bevis for at BLE sender**. «Sist kontakt» er siste periodiske nettøkt; etter 15 minutter blir ikke enheten automatisk deaktivert bare fordi Wi-Fi er av.

## Feilretting i felt

**RESET** alene starter enheten på nytt. **BOOT alene i 5 sekunder etter vanlig oppstart** åpner lokal, passordbeskyttet webportal for å endre Wi-Fi og eventuelt lokalt navn. Teknikeren trenger ikke generere ny engangskode for en allerede innrullert chip. Firmware må beholde chipbinding, device key og sist godkjente beacon-identitet; en feil SSID eller et feil passord skal ikke opprette en ny inventarenhet. Ikke hold BOOT samtidig med RESET eller under strømtilkobling: det er firmware-nedlastingsmodus, ikke oppsettsmodus på ESP32-C3. En fabrikkreset/hardwarebytte er en separat autorisert prosedyre, ikke standard feilretting.
