# Proximity-events og beaconinnhold

MVP-en bruker ESP32-S3 Super Mini som **dumme iBeacon-sendere**. Beaconen sender bare fast identitet:

- felles `UUID`
- `Major = 1`
- `Minor = beaconnummer`

ESP32-en har ingen Wi-Fi, provisioning eller innhold. Mobilappen observerer BLE-signalet og avgjør når et proximity-event har skjedd. Backend kobler eventet til innhold.

## Events i mobilappen

| Event | Betydning | Typisk bruk |
| --- | --- | --- |
| `enter` | Beaconen har blitt stabilt synlig etter å ha vært borte | fun fact, velkomstmelding |
| `near` | Beaconen er stabilt nær / valgt som nærmeste relevante beacon | brukermanual, romhjelp |
| `exit` | Beaconen har vært borte lenge nok til at brukeren regnes som forlatt området | avslutningsmelding, senere bruk |

Dette er **app-events**, ikke signaler sendt av beaconen.

Første mobilimplementasjon bør bruke flere RSSI-observasjoner og hysterese. Ikke opprett `enter` på ett enkelt BLE-pakketreff og ikke opprett `exit` på ett mistet pakketreff. Eksakte terskler skal fysisk testes med de fire MVP-beaconene.

## Innholdstyper

Backend støtter i MVP:

- `fun_fact`
- `manual`
- `message`
- `link`

Innhold kan gjelde enten én bestemt beacon eller hele lokasjonen. Dermed kan en brukermanual ligge på lokasjonen, mens en fun fact kan være unik for beaconen.

Hvert innholdselement har blant annet:

- `trigger_event`: `enter | near | exit`
- `priority`: 0–100
- `cooldown_seconds`: hvor lenge appen bør vente før samme innhold kan trigges igjen
- valgfritt aktivt tidsrom
- `enabled`

Cooldown håndheves i første omgang av mobilappen. Backend returnerer verdien, men lagrer ikke brukerens bevegelses- eller triggerhistorikk.

## API-flyt

Når appen mottar iBeacon-identitet og har bestemt at et event har skjedd:

```text
BLE: UUID=<HVL>, Major=1, Minor=3
            ↓
mobil: "near" for beacon 3
            ↓
GET /api/beacons/resolve?uuid=<HVL>&major=1&minor=3&event=near
            ↓
backend:
- beacon-identitet
- lokasjon
- aktivt innhold for near
            ↓
mobil:
vis kort / manual / melding / lenke
```

Samme lookup kan testes enklere med:

```text
GET /api/beacons/3?event=near
```

Admin-GUI-et har en simulator som kaller samme offentlige endpoint.

## Eksempelrespons

```json
{
  "beacon": {
    "number": 3,
    "uuid": "…",
    "major": 1,
    "minor": 3
  },
  "location": {
    "id": "…",
    "campus": "Kronstad",
    "building": "K2",
    "room_number": "M201",
    "name": "Undervisningsrom"
  },
  "event": "near",
  "content": [
    {
      "content_type": "manual",
      "trigger_event": "near",
      "title": "Slik bruker du skjermen",
      "body_markdown": "…",
      "priority": 80,
      "cooldown_seconds": 3600
    }
  ]
}
```

## Personvern

Backend trenger ikke vite at en bestemt bruker var nær en beacon. BLE-observasjon, RSSI, hysterese og cooldown kan håndteres lokalt på telefonen. API-et trenger bare beaconnummer/event for å levere riktig innhold.
