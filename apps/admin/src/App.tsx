import { useEffect, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./style.css";

type Place = { id:string; campus:string; building:string; room_number:string|null; name:string };
type Beacon = {
  beacon_number:number; place_id:string; enabled:boolean; campus:string; building:string;
  room_number:string|null; place_name:string; uuid:string; major:number; minor:number;
};
type ContentType = "fun_fact" | "manual" | "message" | "link";
type TriggerEvent = "enter" | "near" | "exit";
type ContentItem = {
  id:string; beacon_number:number|null; place_id:string|null; content_type:ContentType;
  trigger_event:TriggerEvent; title:string; body_markdown:string|null; action_url:string|null;
  priority:number; cooldown_seconds:number; enabled:boolean; active_from:string|null; active_to:string|null;
  place_name:string|null; beacon_place_name:string|null;
};
type Config = {
  uuid:string; major:number; minor_is_beacon_number:boolean;
  proximity_events:TriggerEvent[]; content_types:ContentType[];
};
type ResolveResult = {
  beacon:{number:number;uuid:string;major:number;minor:number};
  location:Place; event:TriggerEvent|null; content:ContentItem[];
};

const blankPlace = () => ({ campus:"", building:"", room_number:"", name:"" });
const blankBeacon = () => ({ place_id:"", enabled:true });
const blankContent = () => ({
  scope:"beacon" as "beacon"|"location", target:"", content_type:"fun_fact" as ContentType,
  trigger_event:"enter" as TriggerEvent, title:"", body_markdown:"", action_url:"",
  priority:"50", cooldown_seconds:"3600", enabled:true, active_from:"", active_to:""
});
function placeLabel(p: Pick<Place,"campus"|"building"|"room_number"|"name">) {
  return [p.campus,p.building,p.room_number,p.name].filter(Boolean).join(" · ");
}
function eventLabel(value: TriggerEvent) {
  return value === "enter" ? "Kommer inn i området" : value === "near" ? "Er stabilt nær" : "Forlater området";
}
function typeLabel(value: ContentType) {
  return value === "fun_fact" ? "Fun fact" : value === "manual" ? "Brukermanual" : value === "message" ? "Melding" : "Lenke";
}

export default function App() {
  const [key,setKey]=useState("");
  const [places,setPlaces]=useState<Place[]>([]);
  const [beacons,setBeacons]=useState<Beacon[]>([]);
  const [content,setContent]=useState<ContentItem[]>([]);
  const [config,setConfig]=useState<Config|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const [placeEditing,setPlaceEditing]=useState<string|null>(null);
  const [placeForm,setPlaceForm]=useState(blankPlace());
  const [beaconNumber,setBeaconNumber]=useState("");
  const [beaconEditing,setBeaconEditing]=useState<number|null>(null);
  const [beaconForm,setBeaconForm]=useState(blankBeacon());
  const [contentEditing,setContentEditing]=useState<string|null>(null);
  const [contentForm,setContentForm]=useState(blankContent());

  const [simulateBeacon,setSimulateBeacon]=useState("");
  const [simulateEvent,setSimulateEvent]=useState<TriggerEvent>("enter");
  const [simulation,setSimulation]=useState<ResolveResult|null>(null);

  async function api<T>(path:string,method="GET",body?:object):Promise<T> {
    const response=await fetch("/api"+path,{
      method,
      headers:{...(key?{"X-Admin-Key":key}:{}),...(body?{"Content-Type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined
    });
    const data:unknown=response.status===204?null:await response.json().catch(()=>null);
    if(!response.ok) {
      const message=data&&typeof data==="object"&&"error" in data?String(data.error):"HTTP "+response.status;
      throw Error(message);
    }
    return data as T;
  }
  async function refresh() {
    const [p,b,cfg,c]=await Promise.all([
      api<{places:Place[]}>("/admin/places"),
      api<{beacons:Beacon[]}>("/admin/beacons"),
      api<Config>("/config"),
      api<{content:ContentItem[]}>("/admin/content")
    ]);
    setPlaces(p.places);setBeacons(b.beacons);setConfig(cfg);setContent(c.content);
  }
  async function run(task:()=>Promise<void>) {
    setBusy(true);setError("");setNotice("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  useEffect(()=>{void run(refresh);},[]);

  async function savePlace(e:FormEvent) {
    e.preventDefault();
    await run(async()=>{
      const path=placeEditing?"/admin/places/"+placeEditing:"/admin/places";
      await api(path,placeEditing?"PUT":"POST",placeForm);
      setPlaceEditing(null);setPlaceForm(blankPlace());await refresh();
      setNotice("Lokasjonen er lagret.");
    });
  }
  function editPlace(p:Place) {
    setPlaceEditing(p.id);
    setPlaceForm({campus:p.campus,building:p.building,room_number:p.room_number??"",name:p.name});
  }

  async function saveBeacon(e:FormEvent) {
    e.preventDefault();
    await run(async()=>{
      if(beaconEditing===null) {
        const n=Number(beaconNumber);
        if(!Number.isInteger(n)||n<1||n>65535) throw Error("Beaconnummer må være 1–65535.");
        await api("/admin/beacons","POST",{beacon_number:n,place_id:beaconForm.place_id});
        setNotice("Beacon #"+n+" registrert. ESP32-en trenger ingen kontakt med backend.");
      } else {
        await api("/admin/beacons/"+beaconEditing,"PUT",beaconForm);
        setNotice("Beacon #"+beaconEditing+" er oppdatert.");
      }
      setBeaconNumber("");setBeaconEditing(null);setBeaconForm(blankBeacon());await refresh();
    });
  }
  function editBeacon(b:Beacon) {
    setBeaconEditing(b.beacon_number);setBeaconForm({place_id:b.place_id,enabled:b.enabled});
  }

  function editContent(item:ContentItem) {
    setContentEditing(item.id);
    setContentForm({
      scope:item.beacon_number!==null?"beacon":"location",
      target:String(item.beacon_number??item.place_id??""),
      content_type:item.content_type,trigger_event:item.trigger_event,title:item.title,
      body_markdown:item.body_markdown??"",action_url:item.action_url??"",
      priority:String(item.priority),cooldown_seconds:String(item.cooldown_seconds),
      enabled:item.enabled,
      active_from:item.active_from?item.active_from.slice(0,16):"",
      active_to:item.active_to?item.active_to.slice(0,16):""
    });
  }
  async function saveContent(e:FormEvent) {
    e.preventDefault();
    await run(async()=>{
      const payload={
        beacon_number:contentForm.scope==="beacon"?Number(contentForm.target):null,
        place_id:contentForm.scope==="location"?contentForm.target:null,
        content_type:contentForm.content_type,
        trigger_event:contentForm.trigger_event,
        title:contentForm.title,
        body_markdown:contentForm.body_markdown||null,
        action_url:contentForm.action_url||null,
        priority:Number(contentForm.priority),
        cooldown_seconds:Number(contentForm.cooldown_seconds),
        enabled:contentForm.enabled,
        active_from:contentForm.active_from||null,
        active_to:contentForm.active_to||null
      };
      const path=contentEditing?"/admin/content/"+contentEditing:"/admin/content";
      await api(path,contentEditing?"PUT":"POST",payload);
      setContentEditing(null);setContentForm(blankContent());await refresh();
      setNotice("Innholdstriggeren er lagret.");
    });
  }
  async function removeContent(item:ContentItem) {
    if(!window.confirm("Slette «"+item.title+"»?")) return;
    await run(async()=>{
      await api("/admin/content/"+item.id,"DELETE");
      await refresh();setNotice("Innholdstriggeren er slettet.");
    });
  }
  async function simulate() {
    await run(async()=>{
      if(!simulateBeacon) throw Error("Velg en beacon.");
      const result=await api<ResolveResult>("/beacons/"+simulateBeacon+"?event="+simulateEvent);
      setSimulation(result);
    });
  }

  return <main>
    <header>
      <div>
        <p className="eyebrow">HVL INFO · MVP</p>
        <h1>Beaconinnhold</h1>
        <p>ESP32-S3 sender bare identiteten sin. Mobilappen lager proximity-eventet. Backend bestemmer hvilket innhold eventet skal utløse.</p>
      </div>
      <div className="stat"><strong>{beacons.length}</strong><span>beacons</span></div>
    </header>

    <section className="settings">
      <div><h2>Utvikling uten Entra ID</h2><p>API-et lytter på localhost som standard. Adminnøkkel trengs bare hvis backend er startet med ADMIN_API_KEY.</p></div>
      <label>Adminnøkkel<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="Valgfri lokalt"/></label>
      <button disabled={busy} type="button" onClick={()=>void run(refresh)}>Oppdater</button>
      {config&&<p className="identity">UUID <code>{config.uuid}</code> · Major {config.major} · Minor = beaconnummer</p>}
    </section>
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<p className="success" role="status">{notice}</p>}

    <section>
      <h2>1. Lokasjoner</h2>
      <div className="place-grid">
        {places.map(p=><article className="place-card" key={p.id}>
          <h3>{p.name}</h3><p>{placeLabel(p)}</p>
          <button className="secondary" type="button" onClick={()=>editPlace(p)}>Rediger</button>
        </article>)}
      </div>
      <form onSubmit={savePlace}>
        <h3>{placeEditing?"Rediger lokasjon":"Ny lokasjon"}</h3>
        <div className="fields">
          <label>Campus<input required value={placeForm.campus} onChange={e=>setPlaceForm({...placeForm,campus:e.target.value})}/></label>
          <label>Bygg<input required value={placeForm.building} onChange={e=>setPlaceForm({...placeForm,building:e.target.value})}/></label>
          <label>Romnummer<input value={placeForm.room_number} onChange={e=>setPlaceForm({...placeForm,room_number:e.target.value})}/></label>
          <label>Navn<input required value={placeForm.name} onChange={e=>setPlaceForm({...placeForm,name:e.target.value})}/></label>
        </div>
        <div className="actions"><button disabled={busy}>Lagre lokasjon</button>
          {placeEditing&&<button className="secondary" type="button" onClick={()=>{setPlaceEditing(null);setPlaceForm(blankPlace());}}>Avbryt</button>}</div>
      </form>
    </section>

    <section>
      <h2>2. Beacons</h2>
      <p>Registrer bare nummeret på beaconen og hvor den er plassert. Ingen teknikeroppsett eller Wi-Fi.</p>
      <div className="beacon-grid">
        {beacons.map(b=><article className="beacon-card" key={b.beacon_number}>
          <div className="card-top"><h3>#{b.beacon_number}</h3><span className={b.enabled?"tag":"tag muted"}>{b.enabled?"Aktiv":"Skjult"}</span></div>
          <p>{[b.campus,b.building,b.room_number,b.place_name].filter(Boolean).join(" · ")}</p>
          <p className="identity">Major {b.major} · Minor {b.minor}</p>
          <button type="button" onClick={()=>editBeacon(b)}>Rediger</button>
        </article>)}
      </div>
      <form onSubmit={saveBeacon}>
        <h3>{beaconEditing===null?"Registrer beacon":"Rediger beacon #"+beaconEditing}</h3>
        <div className="fields">
          {beaconEditing===null&&<label>Beaconnummer<input required type="number" min={1} max={65535} value={beaconNumber} onChange={e=>setBeaconNumber(e.target.value)} placeholder="1–4"/></label>}
          <label>Lokasjon<select required value={beaconForm.place_id} onChange={e=>setBeaconForm({...beaconForm,place_id:e.target.value})}>
            <option value="">Velg lokasjon</option>{places.map(p=><option key={p.id} value={p.id}>{placeLabel(p)}</option>)}
          </select></label>
          {beaconEditing!==null&&<label className="check"><input type="checkbox" checked={beaconForm.enabled} onChange={e=>setBeaconForm({...beaconForm,enabled:e.target.checked})}/> Aktiv i backend</label>}
        </div>
        <div className="actions"><button disabled={busy||!places.length}>Lagre beacon</button>
          {beaconEditing!==null&&<button className="secondary" type="button" onClick={()=>{setBeaconEditing(null);setBeaconForm(blankBeacon());}}>Avbryt</button>}</div>
      </form>
    </section>

    <section>
      <h2>3. Innhold som trigges av proximity-event</h2>
      <p>Mobilappen lager eventene <strong>enter</strong>, <strong>near</strong> og <strong>exit</strong>. Innhold kan knyttes til én beacon eller til hele lokasjonen.</p>
      <div className="content-grid">
        {content.map(item=><article className="content-card" key={item.id}>
          <div className="card-top"><h3>{item.title}</h3><span className={item.enabled?"tag":"tag muted"}>{typeLabel(item.content_type)}</span></div>
          <p><strong>{eventLabel(item.trigger_event)}</strong></p>
          <p>{item.beacon_number!==null?"Beacon #"+item.beacon_number:"Lokasjon: "+(item.place_name??"ukjent")}</p>
          <p className="identity">Prioritet {item.priority} · cooldown {item.cooldown_seconds}s</p>
          <div className="actions"><button type="button" onClick={()=>editContent(item)}>Rediger</button>
            <button className="danger" type="button" onClick={()=>void removeContent(item)}>Slett</button></div>
        </article>)}
      </div>
      <form className="editor" onSubmit={saveContent}>
        <h3>{contentEditing?"Rediger innhold":"Nytt innhold"}</h3>
        <div className="fields">
          <label>Type<select value={contentForm.content_type} onChange={e=>setContentForm({...contentForm,content_type:e.target.value as ContentType})}>
            <option value="fun_fact">Fun fact</option><option value="manual">Brukermanual</option><option value="message">Melding</option><option value="link">Lenke</option>
          </select></label>
          <label>Trigger<select value={contentForm.trigger_event} onChange={e=>setContentForm({...contentForm,trigger_event:e.target.value as TriggerEvent})}>
            <option value="enter">Kommer inn i området</option><option value="near">Er stabilt nær</option><option value="exit">Forlater området</option>
          </select></label>
          <label>Gjelder<select value={contentForm.scope} onChange={e=>setContentForm({...contentForm,scope:e.target.value as "beacon"|"location",target:""})}>
            <option value="beacon">Én beacon</option><option value="location">Hele lokasjonen</option>
          </select></label>
          <label>{contentForm.scope==="beacon"?"Beacon":"Lokasjon"}<select required value={contentForm.target} onChange={e=>setContentForm({...contentForm,target:e.target.value})}>
            <option value="">Velg</option>
            {contentForm.scope==="beacon"
              ?beacons.map(b=><option key={b.beacon_number} value={b.beacon_number}>#{b.beacon_number} · {b.place_name}</option>)
              :places.map(p=><option key={p.id} value={p.id}>{placeLabel(p)}</option>)}
          </select></label>
        </div>
        <label>Tittel<input required maxLength={120} value={contentForm.title} onChange={e=>setContentForm({...contentForm,title:e.target.value})}/></label>
        <label>Innhold (Markdown)<textarea rows={6} maxLength={16000} value={contentForm.body_markdown} onChange={e=>setContentForm({...contentForm,body_markdown:e.target.value})}/></label>
        {contentForm.content_type==="link"&&<label>Lenke<input required maxLength={2048} value={contentForm.action_url} onChange={e=>setContentForm({...contentForm,action_url:e.target.value})}/></label>}
        <div className="fields">
          <label>Prioritet 0–100<input type="number" min={0} max={100} value={contentForm.priority} onChange={e=>setContentForm({...contentForm,priority:e.target.value})}/></label>
          <label>Cooldown i sekunder<input type="number" min={0} max={604800} value={contentForm.cooldown_seconds} onChange={e=>setContentForm({...contentForm,cooldown_seconds:e.target.value})}/></label>
          <label>Aktiv fra (valgfritt)<input type="datetime-local" value={contentForm.active_from} onChange={e=>setContentForm({...contentForm,active_from:e.target.value})}/></label>
          <label>Aktiv til (valgfritt)<input type="datetime-local" value={contentForm.active_to} onChange={e=>setContentForm({...contentForm,active_to:e.target.value})}/></label>
        </div>
        <label className="check"><input type="checkbox" checked={contentForm.enabled} onChange={e=>setContentForm({...contentForm,enabled:e.target.checked})}/> Aktiv</label>
        <div className="actions"><button disabled={busy}>Lagre innhold</button>
          {contentEditing&&<button className="secondary" type="button" onClick={()=>{setContentEditing(null);setContentForm(blankContent());}}>Avbryt</button>}</div>
      </form>
    </section>

    <section>
      <h2>4. Simuler mobil-event</h2>
      <p>Dette bruker samme offentlige endpoint som mobilappen kan bruke når BLE-logikken har bestemt at et event faktisk har skjedd.</p>
      <div className="fields">
        <label>Beacon<select value={simulateBeacon} onChange={e=>setSimulateBeacon(e.target.value)}><option value="">Velg</option>{beacons.map(b=><option key={b.beacon_number} value={b.beacon_number}>#{b.beacon_number} · {b.place_name}</option>)}</select></label>
        <label>Event<select value={simulateEvent} onChange={e=>setSimulateEvent(e.target.value as TriggerEvent)}><option value="enter">enter</option><option value="near">near</option><option value="exit">exit</option></select></label>
      </div>
      <button disabled={busy} type="button" onClick={()=>void simulate()}>Simuler event</button>
      {simulation&&<div className="preview">
        <h3>Beacon #{simulation.beacon.number} · {eventLabel(simulation.event??simulateEvent)}</h3>
        <p>{placeLabel(simulation.location)}</p>
        {!simulation.content.length&&<p>Ingen aktivt innhold for dette eventet.</p>}
        {simulation.content.map(item=><article key={item.id}><h4>{item.title}</h4><p className="identity">{typeLabel(item.content_type)} · cooldown {item.cooldown_seconds}s</p>
          {item.body_markdown&&<ReactMarkdown remarkPlugins={[remarkGfm]}>{item.body_markdown}</ReactMarkdown>}
          {item.action_url&&<p><a href={item.action_url} target="_blank" rel="noreferrer">Åpne lenke</a></p>}
        </article>)}
      </div>}
    </section>
  </main>;
}
