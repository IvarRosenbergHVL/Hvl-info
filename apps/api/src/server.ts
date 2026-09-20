import express, { type ErrorRequestHandler, type Request, type Response, type RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { Pool, type PoolClient } from "pg";
import { parseIBeaconIdentity } from "@hvl-info/contracts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const db = new Pool({ connectionString: databaseUrl });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req, res)).catch(next); };

const tenant = process.env.ENTRA_TENANT_ID;
const audience = process.env.ENTRA_API_AUDIENCE;
const adminRole = process.env.ENTRA_ADMIN_ROLE ?? "HvlInfo.Admin";
const userScope = process.env.ENTRA_USER_SCOPE ?? "HvlInfo.Read";
const configured = Boolean(tenant && /^[a-f0-9-]{36}$/i.test(tenant) && audience);
const issuer = configured ? `https://login.microsoftonline.com/${tenant}/v2.0` : "";
const keys = configured ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`)) : null;

type AuthRequest = Request & { identity?: JWTPayload };
const mustBeSignedIn: RequestHandler = async (req, res, next) => {
  if (!keys || !audience) { res.status(503).json({ error: "Entra ID API authentication is not configured" }); return; }
  const match = /^Bearer (.+)$/i.exec(req.header("authorization") ?? "");
  if (!match) { res.status(401).json({ error: "Bearer access token required" }); return; }
  try {
    const { payload } = await jwtVerify(match[1], keys, { issuer, audience, algorithms: ["RS256"] });
    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : [];
    // Delegated users require the API scope. App-only callers require a designated API app role.
    if (!scopes.includes(userScope) && !roles.includes(adminRole)) {
      res.status(403).json({ error: "Required API scope or app role missing" }); return;
    }
    (req as AuthRequest).identity = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid Entra ID access token" });
  }
};
const mustBeAdmin: RequestHandler = (req, res, next) => {
  const roles = (req as AuthRequest).identity?.roles;
  if (!Array.isArray(roles) || !roles.includes(adminRole)) {
    res.status(403).json({ error: "Administrator role required" }); return;
  }
  next();
};
const actor = (req: Request) => String((req as AuthRequest).identity?.oid ?? "unknown");
function text(value: unknown, name: string, max = 128): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value.trim();
}
function uuid(value: unknown, name = "id"): string {
  const input = text(value, name, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return input.toLowerCase();
}
const optional = (value: unknown, name: string, max = 128): string | null =>
  value == null || value === "" ? null : text(value, name, max);
function body(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new HttpError(400, "JSON object required");
  return req.body as Record<string, unknown>;
}
async function audit(client: PoolClient, req: Request, action: string, id: string, details: object = {}) {
  await client.query("INSERT INTO audit_events(actor_oid, action, entity_id, details) VALUES ($1,$2,$3,$4)",
    [actor(req), action, id, JSON.stringify(details)]);
}
async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally { client.release(); }
}

app.get("/health", asyncRoute(async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok" });
}));
app.use("/api", mustBeSignedIn);

app.get("/api/places", asyncRoute(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  const { rows } = await db.query(
    "SELECT id,campus,building,floor,room_number,name,kind FROM places WHERE ($1 = '' OR concat_ws(' ',campus,building,room_number,name) ILIKE '%' || $1 || '%') ORDER BY campus,building,room_number NULLS LAST,name LIMIT 50",
    [q]);
  res.json({ places: rows });
}));
app.get("/api/places/:id", asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  const place = (await db.query("SELECT * FROM places WHERE id=$1", [id])).rows[0];
  if (!place) throw new HttpError(404, "Place not found");
  const guides = (await db.query("SELECT id,title,url,updated_at FROM guides WHERE place_id=$1 ORDER BY title", [id])).rows;
  const incidents = (await db.query("SELECT id,equipment_name,title,workaround,updated_at FROM incidents WHERE place_id=$1 AND status='open' ORDER BY updated_at DESC", [id])).rows;
  res.json({ place, guides, incidents });
}));
app.get("/api/beacons/resolve", asyncRoute(async (req, res) => {
  let beacon;
  try {
    beacon = parseIBeaconIdentity({
      uuid: req.query.uuid,
      major: Number(req.query.major),
      minor: Number(req.query.minor),
    });
  } catch { throw new HttpError(400, "Invalid iBeacon identity"); }
  const { rows } = await db.query(`
    SELECT p.id,p.campus,p.building,p.floor,p.room_number,p.name,p.kind,bp.role
      FROM beacon_identities bi
      JOIN beacon_devices bd ON bd.id=bi.device_id AND bd.state='active'
      JOIN beacon_placements bp ON bp.device_id=bd.id AND bp.removed_at IS NULL
      JOIN places p ON p.id=bp.place_id
      WHERE bi.beacon_uuid=$1 AND bi.major=$2 AND bi.minor=$3`,
    [beacon.uuid, beacon.major, beacon.minor]);
  if (!rows.length) throw new HttpError(404, "No active placement for beacon");
  res.json({ place: rows[0] });
}));

app.use("/api/admin", mustBeAdmin);
app.post("/api/admin/places", asyncRoute(async (req, res) => {
  const v = body(req);
  const kind = text(v.kind, "kind", 32);
  if (!["room","area","service","equipment"].includes(kind)) throw new HttpError(400,"Invalid kind");
  const result = await transaction(async client => {
    const { rows } = await client.query(
      "INSERT INTO places(campus,building,floor,room_number,name,kind) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [text(v.campus,"campus"),text(v.building,"building"),optional(v.floor,"floor"),optional(v.room_number,"room_number"),text(v.name,"name"),kind]);
    await audit(client,req,"place.created",rows[0].id);
    return rows[0];
  });
  res.status(201).json(result);
}));
app.get("/api/admin/devices", asyncRoute(async (_req,res) => {
  const {rows} = await db.query(`
    SELECT d.*, p.place_id, pl.name AS place_name, p.role,
           i.beacon_uuid, i.major, i.minor, i.measured_power
    FROM beacon_devices d
    LEFT JOIN beacon_placements p ON p.device_id=d.id AND p.removed_at IS NULL
    LEFT JOIN places pl ON pl.id=p.place_id
    LEFT JOIN beacon_identities i ON i.device_id=d.id
    ORDER BY d.registered_at DESC LIMIT 200`);
  res.json({ devices: rows });
}));
app.post("/api/admin/devices", asyncRoute(async (req,res) => {
  const v=body(req);
  const hardwareId=text(v.hardware_id,"hardware_id",100);
  if (!/^[a-zA-Z0-9:._-]+$/.test(hardwareId)) throw new HttpError(400,"Invalid hardware_id");
  const device=await transaction(async client => {
    const {rows}=await client.query(
      "INSERT INTO beacon_devices(hardware_id,asset_tag,model) VALUES($1,$2,$3) RETURNING *",
      [hardwareId,optional(v.asset_tag,"asset_tag"),optional(v.model,"model") ?? "ESP32-C3 SuperMini"]);
    await audit(client,req,"device.registered",rows[0].id);
    return rows[0];
  });
  res.status(201).json(device);
}));
app.post("/api/admin/devices/:id/placement", asyncRoute(async(req,res)=>{
  const id=uuid(req.params.id), v=body(req), placeId=uuid(v.place_id,"place_id");
  const role=text(v.role,"role",32);
  if (!["classroom_equipment","area","service","equipment"].includes(role)) throw new HttpError(400,"Invalid role");
  const placement=await transaction(async client => {
    const device=await client.query("SELECT id FROM beacon_devices WHERE id=$1 FOR UPDATE",[id]);
    if (!device.rowCount) throw new HttpError(404,"Device not found");
    const place=await client.query("SELECT id FROM places WHERE id=$1",[placeId]);
    if (!place.rowCount) throw new HttpError(404,"Place not found");
    await client.query("UPDATE beacon_placements SET removed_at=now() WHERE device_id=$1 AND removed_at IS NULL",[id]);
    const {rows}=await client.query("INSERT INTO beacon_placements(device_id,place_id,role) VALUES($1,$2,$3) RETURNING *",[id,placeId,role]);
    await client.query("UPDATE beacon_devices SET state='placed',updated_at=now() WHERE id=$1",[id]);
    await audit(client,req,"device.placed",id,{place_id:placeId,role});
    return rows[0];
  });
  res.status(201).json(placement);
}));
app.put("/api/admin/devices/:id/ibeacon", asyncRoute(async(req,res)=>{
  const id=uuid(req.params.id), v=body(req), commonUuid=process.env.HVL_IBEACON_UUID;
  if (!commonUuid) throw new HttpError(503,"HVL_IBEACON_UUID is not configured");
  let identity;
  try { identity=parseIBeaconIdentity({uuid:commonUuid,major:v.major,minor:v.minor}); }
  catch { throw new HttpError(400,"Invalid iBeacon UUID/major/minor"); }
  const power=v.measured_power === undefined ? -59 : v.measured_power;
  if (typeof power !== "number" || !Number.isInteger(power) || power < -128 || power > 127)
    throw new HttpError(400,"Invalid measured_power");
  const result=await transaction(async client=>{
    const device=await client.query("SELECT id FROM beacon_devices WHERE id=$1 FOR UPDATE",[id]);
    if (!device.rowCount) throw new HttpError(404,"Device not found");
    const {rows}=await client.query(`
      INSERT INTO beacon_identities(device_id,beacon_uuid,major,minor,measured_power)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(device_id) DO UPDATE SET
        beacon_uuid=EXCLUDED.beacon_uuid,major=EXCLUDED.major,minor=EXCLUDED.minor,
        measured_power=EXCLUDED.measured_power,updated_at=now()
      RETURNING *`,[id,identity.uuid,identity.major,identity.minor,power]);
    await client.query("UPDATE beacon_devices SET state='placed',updated_at=now() WHERE id=$1",[id]);
    await audit(client,req,"device.identity.assigned",id,{major:identity.major,minor:identity.minor});
    return rows[0];
  });
  res.json(result);
}));
app.post("/api/admin/devices/:id/confirm", asyncRoute(async(req,res)=>{
  const id=uuid(req.params.id), v=body(req);
  if (v.physically_verified !== true) throw new HttpError(400,"Explicit physical verification required");
  const result=await transaction(async client=>{
    const {rows}=await client.query(`
      UPDATE beacon_devices d SET state='active',updated_at=now()
      WHERE d.id=$1 AND d.state IN ('placed','active')
        AND EXISTS(SELECT 1 FROM beacon_identities i WHERE i.device_id=d.id)
        AND EXISTS(SELECT 1 FROM beacon_placements p WHERE p.device_id=d.id AND p.removed_at IS NULL)
      RETURNING *`,[id]);
    if (!rows.length) throw new HttpError(409,"Device must have identity and placement before activation");
    await audit(client,req,"device.physically_verified",id);
    return rows[0];
  });
  res.json(result);
}));
app.post("/api/admin/devices/:id/disable", asyncRoute(async(req,res)=>{
  const id=uuid(req.params.id);
  const result=await transaction(async client=>{
    const {rows}=await client.query("UPDATE beacon_devices SET state='disabled',updated_at=now() WHERE id=$1 RETURNING *",[id]);
    if (!rows.length) throw new HttpError(404,"Device not found");
    await audit(client,req,"device.disabled.in_registry",id);
    return rows[0];
  });
  // Registry disable does not physically stop an offline beacon: operator must unplug it.
  res.json({device:result,warning:"Registry disabled only: physically power off until remote control is implemented."});
}));

const errorHandler:ErrorRequestHandler=(err:unknown,_req,res,_next)=>{
  if (err instanceof HttpError) { res.status(err.status).json({error:err.message}); return; }
  if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
    res.status(409).json({error:"Conflicting unique value"}); return;
  }
  if (err instanceof SyntaxError && "body" in err) {res.status(400).json({error:"Malformed JSON"});return;}
  console.error(err);
  res.status(500).json({error:"Internal server error"});
};
app.use(errorHandler);
const port=Number(process.env.PORT ?? 3000);
const server=app.listen(port,()=>console.log(`HVL Info API listening on ${port}`));
const shutdown=()=>{server.close(()=>{void db.end();});};
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
