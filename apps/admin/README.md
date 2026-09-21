# HVL Info Admin

React/Vite-admin for den enkle fire-beacon-MVP-en.

Admin brukes til å:

- opprette og redigere lokasjoner
- registrere beaconnummer + lokasjon
- aktivere/deaktivere beaconen i backend
- opprette proximity-utløst innhold
- knytte innhold til beacon eller lokasjon
- velge event: `enter`, `near` eller `exit`
- velge innholdstype: `fun_fact`, `manual`, `message` eller `link`
- sette prioritet, cooldown og valgfritt aktivt tidsrom
- simulere et mobil-event mot samme offentlige API som appen skal bruke

Entra ID er utsatt. Lokalt kreves ingen innlogging. Hvis backend bruker `ADMIN_API_KEY`, kan nøkkelen legges inn i admin-skjermen for utvikling.

Fra repo-roten:

```bash
npm run dev:api
# nytt terminalvindu
npm run dev:admin
```

Vite proxyer `/api` til `http://127.0.0.1:3000`.

Se [proximity-eventkontrakten](../../docs/PROXIMITY-EVENTS.md).
