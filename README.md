# HVL Info – enkel iBeacon-MVP

Fire fungerende **ESP32-S3 Super Mini** sender iBeacon over BLE. Backend skal ikke snakke med kortene; den kobler identitet til sted og innhold. Ingen Wi-Fi/provisioning på senderne, ingen Entra ID i første versjon.

## Fast identitet på de fire senderne

```text
UUID  = 12345678-1234-1234-1234-1234567890ab
Major = 1
Minor = 1, 2, 3 eller 4 (nummeret på enheten)
```

UUID-en over er fra Arduino-testsketchen. Dersom én eller flere beacons ble flashet med en annen UUID, må `HVL_IBEACON_UUID` samsvare med det som faktisk annonseres, og alle fire må bruke samme UUID.

## MVP-en inneholder

- Node.js 22 + Express + PostgreSQL.
- Egen liten MVP-database med `simple_places`, `simple_beacons` og `simple_proximity_content` (migrasjoner 005–006).
- React/Vite-admin: lokasjoner, nummererte beacons, innhold, prioritet/cooldown/tidsvindu og event-simulator.
- Offentlig lesende REST-API: beacon → lokasjon + relevant innhold.
- Fire innholdstyper: `fun_fact`, `manual`, `message`, `link`.
- Tre app-events: `enter`, `near`, `exit`.
- Valgfri utviklingsnøkkel for admin i stedet for Entra ID foreløpig.
- En opt-in integrasjons-smoketest mot en **egen lokal testdatabase**.

Mobilappen er ikke ferdig. Den skal oppdage BLE og produsere events lokalt basert på flere observasjoner; backend produserer ikke events eller push-varsler.

## Kom i gang på Windows / PowerShell

Krav: Node.js 22+, npm, Docker Desktop (eller PostgreSQL 16 som du kjører selv).

Fra repo-roten:

```powershell
npm install
docker compose -f infra/compose.yaml up -d postgres
Copy-Item .env.example apps/api/.env
npm run db:migrate
```

Kontroller `apps/api/.env` og at UUID matcher dine beacons. Start API:

```powershell
npm run dev:api
```

Åpne en ny terminal i repo-roten:

```powershell
npm run dev:admin
```

Admin: <http://localhost:5173> · API-helsesjekk: <http://127.0.0.1:3000/health>.

I admin: opprett de fire stedene, registrer #1–#4 med plassering, opprett én `enter`-fun fact på hver beacon og to `near`-manualer på de to relevante lokasjonene. Bruk event-simulatoren til å kontrollere innholdet.

## Sjekk API-et selv

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/config
Invoke-RestMethod 'http://127.0.0.1:3000/api/beacons/3?event=enter'
Invoke-RestMethod 'http://127.0.0.1:3000/api/beacons/3?event=near'
```

Den siste testen forutsetter at beacon #3 er registrert, aktiv og har innhold på det aktuelle eventet. Hvis eventet ikke har innhold, er `content` en tom liste.

## Integrasjonstest (egen lokal utviklingsdatabase)

Etter at API-et kjører mot en **testdatabase**:

```powershell
$env:SMOKE_ALLOW_WRITES='yes'
npm run smoke:mvp
Remove-Item Env:SMOKE_ALLOW_WRITES
```

Testen oppretter midlertidig lokasjon/beacon/innhold, verifiserer responsene og forsøker å rydde opp. Ikke kjør mot ekte administrasjonsdata.

## Fra mobil på samme nett

API-et binder til `127.0.0.1` som standard. Dette virker fra PC-en, ikke fra telefonen. For lokal mobilutvikling må API-et bindes til en tilgjengelig adresse (for eksempel `API_HOST=0.0.0.0`) **og** `ADMIN_API_KEY` settes til minst 16 tilfeldige tegn. Åpne bare nødvendig port i lokal brannmur. Bruk HTTPS før løsning eller adminnøkkel eksponeres på et delt nett, og ikke publiser MVP-admin på internett uten ordentlig pålogging/autorisasjon.

## API og videre lesning

- [Backend og endepunkter](apps/api/README.md)
- [Proximity-events og mobilkontrakt](docs/PROXIMITY-EVENTS.md)
- [Admin-GUI](apps/admin/README.md)

Eldre eksperimenter med enhetsregistrering, lokal Wi-Fi-portal og Entra ID ligger bevart i repoet, men er ikke standard MVP. Eldre planer og issues kan omtale dette sporet.

**Status:** Koden og lokal smoketest er skrevet og sjekket inn. Full `npm install`/TypeScript-bygg, PostgreSQL-migrasjon og kjøring av smoketesten må fortsatt verifiseres i et miljø med repo- og databaseadgang. Ingen GitHub Actions brukes.
