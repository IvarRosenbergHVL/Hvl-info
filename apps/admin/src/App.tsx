import { useEffect, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./style.css";

type Place = {
  id: string; campus: string; building: string; room_number: string | null;
  name: string; manual_title: string | null; manual_markdown: string | null;
};
type Beacon = {
  beacon_number: number; place_id: string; place_name: string; campus: string;
  building: string; room_number: string | null; fun_fact_title: string | null;
  fun_fact_text: string | null; enabled: boolean; uuid: string; major: number; minor: number;
};
type Config = { uuid: string; major: number; minor_is_beacon_number: boolean };
type PlaceForm = {
  campus: string; building: string; room_number: string; name: string;
  manual_title: string; manual_markdown: string;
};
type BeaconForm = { place_id: string; fun_fact_title: string; fun_fact_text: string; enabled: boolean };
const blankPlace = (): PlaceForm => ({
  campus: "", building: "", room_number: "", name: "", manual_title: "", manual_markdown: ""
});
const blankBeacon = (): BeaconForm => ({ place_id: "", fun_fact_title: "", fun_fact_text: "", enabled: true });
function locationLabel(p: Pick<Place, "campus" | "building" | "room_number" | "name">) {
  return [p.campus, p.building, p.room_number, p.name].filter(Boolean).join(" · ");
}

export default function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [placeEditing, setPlaceEditing] = useState<string | null>(null);
  const [placeForm, setPlaceForm] = useState<PlaceForm>(blankPlace);
  const [number, setNumber] = useState("");
  const [beaconForm, setBeaconForm] = useState<BeaconForm>(blankBeacon);
  const [beaconEditing, setBeaconEditing] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  async function api<T>(path: string, method = "GET", data?: object): Promise<T> {
    const response = await fetch("/api" + path, {
      method,
      headers: {
        ...(key ? { "X-Admin-Key": key } : {}),
        ...(data ? { "Content-Type": "application/json" } : {})
      },
      body: data ? JSON.stringify(data) : undefined
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = value && typeof value === "object" && "error" in value ? String(value.error) : "HTTP " + response.status;
      throw Error(message);
    }
    return value as T;
  }
  async function refresh() {
    const [p, b, c] = await Promise.all([
      api<{ places: Place[] }>("/admin/places"),
      api<{ beacons: Beacon[] }>("/admin/beacons"),
      api<Config>("/config")
    ]);
    setPlaces(p.places); setBeacons(b.beacons); setConfig(c);
  }
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void run(refresh); }, []);

  function editPlace(p: Place) {
    setPlaceEditing(p.id);
    setPlaceForm({
      campus:p.campus,building:p.building,room_number:p.room_number ?? "",
      name:p.name,manual_title:p.manual_title ?? "",manual_markdown:p.manual_markdown ?? ""
    });
  }
  async function savePlace(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (Boolean(placeForm.manual_title.trim()) !== Boolean(placeForm.manual_markdown.trim())) {
        throw Error("Fyll inn både manualtittel og manualtekst, eller la begge stå tomme.");
      }
      const route = placeEditing ? "/admin/places/" + placeEditing : "/admin/places";
      await api(route, placeEditing ? "PUT" : "POST", placeForm);
      setPlaceForm(blankPlace()); setPlaceEditing(null);
      await refresh(); setNotice("Lokasjonen er lagret.");
    });
  }
  async function createBeacon(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const n = Number(number);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw Error("Beaconnummer må være mellom 1 og 65535.");
      if (Boolean(beaconForm.fun_fact_title.trim()) !== Boolean(beaconForm.fun_fact_text.trim())) {
        throw Error("Fyll inn både fun fact-tittel og tekst, eller la begge stå tomme.");
      }
      await api("/admin/beacons", "POST", { beacon_number:n, ...beaconForm });
      setNumber(""); setBeaconForm(blankBeacon());
      await refresh(); setNotice("Beacon #" + n + " registrert. Ingen kontakt med ESP32 er nødvendig.");
    });
  }
  function editBeacon(b: Beacon) {
    setBeaconEditing(b.beacon_number);
    setBeaconForm({
      place_id:b.place_id,fun_fact_title:b.fun_fact_title ?? "",
      fun_fact_text:b.fun_fact_text ?? "",enabled:b.enabled
    });
  }
  async function saveBeacon(e: FormEvent) {
    e.preventDefault();
    if (beaconEditing === null) return;
    await run(async () => {
      if (Boolean(beaconForm.fun_fact_title.trim()) !== Boolean(beaconForm.fun_fact_text.trim())) {
        throw Error("Fyll inn både fun fact-tittel og tekst, eller la begge stå tomme.");
      }
      await api("/admin/beacons/" + beaconEditing, "PUT", beaconForm);
      setBeaconEditing(null); setBeaconForm(blankBeacon());
      await refresh(); setNotice("Beacon #" + beaconEditing + " oppdatert.");
    });
  }
  const selected = preview === null ? null : beacons.find(b => b.beacon_number === preview) ?? null;
  const manual = selected?.manual_title && selected.manual_markdown
    ? { title:selected.manual_title, markdown:selected.manual_markdown } : null;

  return <main>
    <header>
      <div><p className="eyebrow">HVL INFO · MVP</p><h1>Fire beacons. Fire steder.</h1>
        <p>Fast BLE-identitet på ESP32-S3 Super Mini. Innhold og plassering styres her.</p></div>
      <div className="stat"><strong>{beacons.length}</strong><span>registrerte beacons</span></div>
    </header>

    <section className="settings">
      <div><h2>API-tilgang</h2><p>Lokalt oppsett uten Entra ID. Nøkkel brukes bare dersom backend er konfigurert med ADMIN_API_KEY.</p></div>
      <label>Adminnøkkel (valgfri lokalt)<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="Kun hvis backend krever nøkkel" /></label>
      <button type="button" disabled={busy} onClick={() => void run(refresh)}>Koble til / oppdater</button>
      {config && <p className="identity">Felles UUID: <code>{config.uuid}</code> · Major: {config.major} · Minor: nummeret på beaconen</p>}
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="success">{notice}</p>}

    <section>
      <h2>1. Lokasjoner og brukermanualer</h2>
      <p>Manualen tilhører lokasjonen, ikke beaconen. Du kan la manualfeltene stå tomme på to av stedene.</p>
      <div className="place-grid">
        {places.map(p => <article key={p.id} className="place-card">
          <h3>{p.name}</h3><p>{locationLabel(p)}</p>
          <span className={p.manual_title ? "tag" : "tag muted"}>{p.manual_title ? "Har brukermanual" : "Ingen manual"}</span>
          <button type="button" className="secondary" disabled={busy} onClick={() => editPlace(p)}>Rediger sted</button>
        </article>)}
      </div>
      <form onSubmit={savePlace}>
        <h3>{placeEditing ? "Rediger lokasjon" : "Ny lokasjon"}</h3>
        <div className="fields">
          <label>Campus<input required maxLength={120} value={placeForm.campus} onChange={e => setPlaceForm({...placeForm,campus:e.target.value})}/></label>
          <label>Bygg<input required maxLength={120} value={placeForm.building} onChange={e => setPlaceForm({...placeForm,building:e.target.value})}/></label>
          <label>Romnummer (valgfritt)<input maxLength={40} value={placeForm.room_number} onChange={e => setPlaceForm({...placeForm,room_number:e.target.value})}/></label>
          <label>Navn<input required maxLength={120} value={placeForm.name} onChange={e => setPlaceForm({...placeForm,name:e.target.value})}/></label>
        </div>
        <label>Brukermanual – tittel (valgfritt)<input maxLength={120} value={placeForm.manual_title} onChange={e => setPlaceForm({...placeForm,manual_title:e.target.value})}/></label>
        <label>Brukermanual – Markdown (valgfritt)<textarea rows={7} maxLength={16000} value={placeForm.manual_markdown} onChange={e => setPlaceForm({...placeForm,manual_markdown:e.target.value})} placeholder="## Slik bruker du utstyret …"/></label>
        <div className="actions"><button disabled={busy} type="submit">{placeEditing ? "Lagre lokasjon" : "Opprett lokasjon"}</button>
          {placeEditing && <button type="button" className="secondary" onClick={() => {setPlaceEditing(null);setPlaceForm(blankPlace());}}>Avbryt</button>}</div>
      </form>
    </section>

    <section>
      <h2>2. Registrer beacon</h2><p>Bruk nummeret som allerede ligger i firmware og står på enheten. Ingen oppsett, Wi-Fi eller innrullering.</p>
      <form onSubmit={createBeacon}>
        <div className="fields">
          <label>Beaconnummer<input required min={1} max={65535} step={1} type="number" value={number} onChange={e => setNumber(e.target.value)} placeholder="1–4"/></label>
          <label>Lokasjon<select required value={beaconForm.place_id} onChange={e => setBeaconForm({...beaconForm,place_id:e.target.value})}>
            <option value="">Velg lokasjon</option>{places.map(p => <option key={p.id} value={p.id}>{locationLabel(p)}</option>)}
          </select></label>
        </div>
        <label>Fun fact – tittel<input maxLength={120} value={beaconForm.fun_fact_title} onChange={e => setBeaconForm({...beaconForm,fun_fact_title:e.target.value})}/></label>
        <label>Fun fact – tekst<textarea rows={3} maxLength={16000} value={beaconForm.fun_fact_text} onChange={e => setBeaconForm({...beaconForm,fun_fact_text:e.target.value})}/></label>
        <button disabled={busy || !places.length} type="submit">Registrer beacon</button>
      </form>
    </section>

    <section>
      <h2>3. Registrerte beacons</h2>
      <p>Deaktivert betyr at backend ikke leverer innhold; selve ESP32 fortsetter å sende BLE til strømmen kobles fra.</p>
      <div className="beacon-grid">
        {beacons.map(b => <article key={b.beacon_number} className="beacon-card">
          <div className="card-top"><h3>#{b.beacon_number}</h3><span className={b.enabled ? "tag" : "tag muted"}>{b.enabled ? "Aktiv i backend" : "Skjult i backend"}</span></div>
          <p>{[b.campus,b.building,b.room_number,b.place_name].filter(Boolean).join(" · ")}</p>
          <p className="identity">Major {b.major} · Minor {b.minor}</p>
          <p>{b.fun_fact_title ? "Fun fact: " + b.fun_fact_title : "Fun fact mangler"} · {b.manual_title ? "Har manual" : "Ingen manual"}</p>
          <div className="actions"><button type="button" disabled={busy} onClick={() => editBeacon(b)}>Rediger</button>
            <button type="button" className="secondary" onClick={() => setPreview(preview === b.beacon_number ? null : b.beacon_number)}>Forhåndsvis</button></div>
        </article>)}
      </div>
      {beaconEditing !== null && <form className="editor" onSubmit={saveBeacon}>
        <h3>Rediger beacon #{beaconEditing}</h3>
        <label>Lokasjon<select required value={beaconForm.place_id} onChange={e => setBeaconForm({...beaconForm,place_id:e.target.value})}>
          <option value="">Velg lokasjon</option>{places.map(p => <option key={p.id} value={p.id}>{locationLabel(p)}</option>)}
        </select></label>
        <label>Fun fact – tittel<input maxLength={120} value={beaconForm.fun_fact_title} onChange={e => setBeaconForm({...beaconForm,fun_fact_title:e.target.value})}/></label>
        <label>Fun fact – tekst<textarea rows={3} maxLength={16000} value={beaconForm.fun_fact_text} onChange={e => setBeaconForm({...beaconForm,fun_fact_text:e.target.value})}/></label>
        <label className="check"><input type="checkbox" checked={beaconForm.enabled} onChange={e => setBeaconForm({...beaconForm,enabled:e.target.checked})}/> Vis beaconinnhold i appen</label>
        <div className="actions"><button disabled={busy} type="submit">Lagre endringer</button>
          <button className="secondary" type="button" onClick={() => {setBeaconEditing(null);setBeaconForm(blankBeacon());}}>Avbryt</button></div>
      </form>}
      {selected && <div className="preview">
        <h3>Mobilinnhold – beacon #{selected.beacon_number}</h3>
        <p>{[selected.campus,selected.building,selected.room_number,selected.place_name].filter(Boolean).join(" · ")}</p>
        {selected.fun_fact_title ? <article><h4>{selected.fun_fact_title}</h4><p>{selected.fun_fact_text}</p></article> : <p>Ingen fun fact ennå.</p>}
        {manual ? <article><h4>{manual.title}</h4><ReactMarkdown remarkPlugins={[remarkGfm]}>{manual.markdown}</ReactMarkdown></article> : <p>Ingen brukermanual på denne lokasjonen.</p>}
        {!selected.enabled && <p className="error">Beaconen er skjult i det offentlige API-et.</p>}
      </div>}
      {!beacons.length && <p>Ingen beacons registrert ennå. Opprett et sted og registrer #1–#4.</p>}
    </section>
  </main>;
}
