import { useEffect, useState, type FormEvent } from "react";
import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";
import "./style.css";
type Place={id:string;campus:string;building:string;room_number:string|null;name:string};
type Device={id:string;hardware_id:string;friendly_name:string|null;state:string;place_name:string|null;beacon_uuid:string|null;major:number|null;minor:number|null;last_seen_at:string|null;config_version:number;reported_version:number|null};
const tenant=import.meta.env.VITE_ENTRA_TENANT_ID as string|undefined;
const clientId=import.meta.env.VITE_ENTRA_CLIENT_ID as string|undefined;
const scope=import.meta.env.VITE_ENTRA_API_SCOPE as string|undefined;
const msal=tenant&&clientId?new PublicClientApplication({auth:{clientId,authority:"https://login.microsoftonline.com/"+tenant,redirectUri:window.location.origin+"/"},cache:{cacheLocation:"sessionStorage"}}):null;
export default function App(){
 const [ready,setReady]=useState(false),[loggedIn,setLoggedIn]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [places,setPlaces]=useState<Place[]>([]),[devices,setDevices]=useState<Device[]>([]);
 const [selectedPlace,setSelectedPlace]=useState(""),[hardware,setHardware]=useState("");
 const [name,setName]=useState(""),[major,setMajor]=useState("100"),[minor,setMinor]=useState("1");
 const [role,setRole]=useState("classroom_equipment");
 const [shownToken,setShownToken]=useState<{id:string;token:string}|null>(null);
 const [place,setPlace]=useState({campus:"",building:"",room_number:"",name:"",kind:"room"});
 useEffect(()=>{if(!msal){setReady(true);return;} void msal.initialize().then(()=>msal!.handleRedirectPromise()).then(()=>{setLoggedIn(msal!.getAllAccounts().length>0);setReady(true);}).catch(e=>{setError(String(e));setReady(true);});},[]);
 async function accessToken():Promise<string>{
  if(!msal||!scope)throw Error("Entra-konfigurasjon mangler");
  const account=msal.getAllAccounts()[0];if(!account)throw Error("Logg inn først");
  try{return(await msal.acquireTokenSilent({account,scopes:[scope]})).accessToken;}
  catch(e){if(e instanceof InteractionRequiredAuthError)await msal.acquireTokenRedirect({account,scopes:[scope]});throw e;}
 }
 async function api<T>(path:string,method="GET",payload?:object):Promise<T>{
  const response=await fetch("/api"+path,{method,headers:{"Authorization":"Bearer "+await accessToken(),...(payload?{"Content-Type":"application/json"}:{})},body:payload?JSON.stringify(payload):undefined});
  const data=await response.json();if(!response.ok)throw Error(data.error||"HTTP "+response.status);return data as T;
 }
 async function refresh(){const [p,d]=await Promise.all([api<{places:Place[]}>("/places"),api<{devices:Device[]}>("/admin/devices")]);setPlaces(p.places);setDevices(d.devices);}
 async function run(work:()=>Promise<void>){setBusy(true);setError("");setNotice("");try{await work();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 useEffect(()=>{if(loggedIn)void run(refresh);},[loggedIn]);
 async function addPlace(e:FormEvent){e.preventDefault();await run(async()=>{await api("/admin/places","POST",{...place,room_number:place.room_number||null});setPlace({campus:"",building:"",room_number:"",name:"",kind:"room"});await refresh();setNotice("Sted opprettet");});}
 async function register(e:FormEvent){e.preventDefault();await run(async()=>{
  const d=await api<Device>("/admin/devices","POST",{hardware_id:hardware.trim().toUpperCase(),friendly_name:name.trim()});
  await api("/admin/devices/"+d.id+"/placement","POST",{place_id:selectedPlace,role});
  await api("/admin/devices/"+d.id+"/ibeacon","PUT",{major:Number(major),minor:Number(minor)});
  setNotice("Registrert "+d.hardware_id+". Opprett engangskode for oppsett.");setHardware("");setName("");await refresh();
 });}
 async function issue(d:Device){await run(async()=>{
  const r=await api<{provisioning_token:string}>("/admin/devices/"+d.id+"/enrollment","POST",{});
  setShownToken({id:d.id,token:r.provisioning_token});setNotice("Koden vises én gang og utløper etter 15 minutter");
 });}
 async function confirm(d:Device){if(!confirmDialog("Har du fysisk verifisert riktig UUID/Major/Minor på stedet?"))return;
  await run(async()=>{await api("/admin/devices/"+d.id+"/confirm","POST",{physically_verified:true});await refresh();setNotice("Fysisk test er bekreftet av operatør");});}
 async function disable(d:Device){if(!confirmDialog("Deaktivere? Enheten kan sende til neste periodiske sjekk. Trekk ut strøm hvis umiddelbar stopp er nødvendig."))return;
  await run(async()=>{await api("/admin/devices/"+d.id+"/disable","POST",{});await refresh();setNotice("Deaktivert i registeret; sender stopper først etter neste vellykkede sjekk");});}
 function confirmDialog(msg:string){return window.confirm(msg);}
 if(!ready)return <main>Forbereder innlogging …</main>;
 if(!msal||!scope)return <main><h1>HVL Info Admin</h1><p>Konfigurer VITE_ENTRA_TENANT_ID, VITE_ENTRA_CLIENT_ID og VITE_ENTRA_API_SCOPE.</p></main>;
 if(!loggedIn)return <main><h1>HVL Info Admin</h1><button onClick={()=>void msal.loginRedirect({scopes:[scope]})}>Logg inn med Entra ID</button>{error&&<p role="alert">{error}</p>}</main>;
 return <main><header><div><h1>HVL Info</h1><p>Beaconadministrasjon</p></div><button onClick={()=>void msal.logoutRedirect()}>Logg ut</button></header>
 {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="ok">{notice}</p>}
 <section><h2>1. Opprett sted</h2><form onSubmit={addPlace}>
 <label>Campus<input required value={place.campus} onChange={e=>setPlace({...place,campus:e.target.value})}/></label>
 <label>Bygg<input required value={place.building} onChange={e=>setPlace({...place,building:e.target.value})}/></label>
 <label>Romnummer<input value={place.room_number} onChange={e=>setPlace({...place,room_number:e.target.value})}/></label>
 <label>Stedsnavn<input required value={place.name} onChange={e=>setPlace({...place,name:e.target.value})}/></label>
 <label>Type<select value={place.kind} onChange={e=>setPlace({...place,kind:e.target.value})}>{["room","area","service","equipment"].map(x=><option key={x}>{x}</option>)}</select></label>
 <button disabled={busy}>Opprett sted</button></form></section>
 <section><h2>2. Registrer ESP32</h2><p>Maskinvare-ID finner du på USB Serial Monitor. Navnet er en etikett; beacon-identiteten er UUID/Major/Minor.</p>
 <form onSubmit={register}>
 <label>Hardware ID<input required pattern="[A-Fa-f0-9:._-]+" value={hardware} onChange={e=>setHardware(e.target.value)}/></label>
 <label>Navn<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Lærerpult M204"/></label>
 <label>Sted<select required value={selectedPlace} onChange={e=>setSelectedPlace(e.target.value)}><option value="">Velg sted</option>{places.map(p=><option value={p.id} key={p.id}>{p.campus} / {p.building} / {p.room_number||p.name}</option>)}</select></label>
 <label>Rolle<select value={role} onChange={e=>setRole(e.target.value)}>{["classroom_equipment","area","service","equipment"].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Major<input type="number" min="0" max="65535" value={major} onChange={e=>setMajor(e.target.value)} required/></label>
 <label>Minor<input type="number" min="0" max="65535" value={minor} onChange={e=>setMinor(e.target.value)} required/></label>
 <button disabled={busy||!places.length}>Registrer</button></form></section>
 {shownToken&&<section className="token"><h2>Engangskode – vises kun nå</h2><p>Enhet: {shownToken.id}. Koble mobil til enhetens midlertidige Wi-Fi, åpne http://192.168.4.1, velg Wi-Fi, sett navn og skriv inn koden.</p><code>{shownToken.token}</code><p>Gyldig 15 minutter. Wi-Fi-passord skrives kun på ESP32 sin lokale oppsettside.</p><button onClick={()=>setShownToken(null)}>Skjul kode</button></section>}
 <section><h2>3. Enhetsoversikt</h2><button disabled={busy} onClick={()=>void run(refresh)}>Oppdater</button><div className="devices">
 {devices.map(d=><article key={d.id}><h3>{d.friendly_name||d.hardware_id}</h3><p>{d.hardware_id} · {d.state} · {d.place_name||"Ikke plassert"}</p>
 <p>{d.beacon_uuid||"Mangler UUID"} / {d.major??"–"} / {d.minor??"–"}</p>
 <p><small>Sist sjekket: {d.last_seen_at?new Date(d.last_seen_at).toLocaleString("no-NO"):"Aldri"} · Konfig ønsket: {d.config_version}, rapportert: {d.reported_version??"–"}</small></p>
 <div className="actions"><button disabled={busy||d.state==="disabled"} onClick={()=>void issue(d)}>Engangskode</button>
 <button disabled={busy||d.state==="disabled"} onClick={()=>void confirm(d)}>Bekreft test</button>
 <button disabled={busy||d.state==="disabled"} onClick={()=>void disable(d)}>Deaktiver</button></div></article>)}</div></section></main>;
}
