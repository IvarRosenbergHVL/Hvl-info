import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type Request, type Response, type RequestHandler } from "express";
import { Pool } from "pg";

// Simple MVP: ESP32-S3 Super Mini boards only advertise a fixed iBeacon identity.
// The phone interprets proximity. The backend maps beacon/location + mobile event to content.
const ibeaconUuid = (process.env.HVL_IBEACON_UUID ?? "").toLowerCase();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ibeaconUuid)) {
  throw new Error("Set HVL_IBEACON_UUID to the UUID flashed on all beacons");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const host = process.env.API_HOST ?? "127.0.0.1";
const adminKey = process.env.ADMIN_API_KEY ?? "";
const exposed = host !== "127.0.0.1" && host !== "::1" && host !== "localhost";
if ((exposed || process.env.NODE_ENV === "production") && adminKey.length < 16) {
  throw new Error("ADMIN_API_KEY (at least 16 characters) is required outside local development");
}

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req, res)).catch(next); };

function payload(req: Request): Record<string, unknown> {
  if (req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new HttpError(400, "JSON object required");
  }
  return req.body as Record<string, unknown>;
}
function required(value: unknown, name: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, "Invalid " + name);
  }
  return value.trim();
}
function optional(value: unknown, name: string, max = 120): string | null {
  if (value === undefined || value === null || value === "") return null;
  return required(value, name, max);
}
function id(value: unknown, name = "id"): string {
  const v = required(value, name, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new HttpError(400, "Invalid " + name);
  }
  return v.toLowerCase();
}
function beaconNumber(value: unknown): number {
  const n = typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 65535) {
    throw new HttpError(400, "Beacon number must be 1–65535");
  }
  return n;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  const n = typeof value === "string" && /^-?[0-9]+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, "Invalid " + name);
  }
  return n;
}
const contentTypes = ["fun_fact", "manual", "message", "link"] as const;
const triggerEvents = ["enter", "near", "exit"] as const;
type ContentType = typeof contentTypes[number];
type TriggerEvent = typeof triggerEvents[number];

function choice<T extends readonly string[]>(value: unknown, name: string, values: T): T[number] {
  const v = required(value, name, 40);
  if (!(values as readonly string[]).includes(v)) throw new HttpError(400, "Invalid " + name);
  return v as T[number];
}
function timestamp(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const v = required(value, name, 40);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid " + name);
  return d.toISOString();
}
function validPlace(v: Record<string, unknown>) {
  return {
    campus: required(v.campus, "campus"),
    building: required(v.building, "building"),
    roomNumber: optional(v.room_number, "room_number", 40),
    name: required(v.name, "name")
  };
}
function validContent(v: Record<string, unknown>) {
  const contentType = choice(v.content_type, "content_type", contentTypes);
  const triggerEvent = choice(v.trigger_event, "trigger_event", triggerEvents);
  const b = v.beacon_number === undefined || v.beacon_number === null || v.beacon_number === ""
    ? null : beaconNumber(v.beacon_number);
  const p = v.place_id === undefined || v.place_id === null || v.place_id === ""
    ? null : id(v.place_id, "place_id");
  if ((b === null) === (p === null)) throw new HttpError(400, "Content must target exactly one beacon or one location");
  const actionUrl = optional(v.action_url, "action_url", 2048);
  if (contentType === "link" && !actionUrl) throw new HttpError(400, "Link content requires action_url");
  if (actionUrl) {
    try {
      const parsed = new URL(actionUrl);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname) {
        throw new Error("Unsupported URL protocol");
      }
      if (parsed.username || parsed.password) throw new Error("Credentials in URL are not supported");
    } catch {
      throw new HttpError(400, "action_url must be an absolute HTTP(S) URL without credentials");
    }
  }
  const activeFrom = timestamp(v.active_from, "active_from");
  const activeTo = timestamp(v.active_to, "active_to");
  if (activeFrom && activeTo && activeTo <= activeFrom) {
    throw new HttpError(400, "active_to must be after active_from");
  }
  if (v.enabled !== undefined && typeof v.enabled !== "boolean") {
    throw new HttpError(400, "enabled must be boolean");
  }
  return {
    beaconNumber: b,
    placeId: p,
    contentType,
    triggerEvent,
    title: required(v.title, "title"),
    body: optional(v.body_markdown, "body_markdown", 16000),
    actionUrl,
    priority: integer(v.priority ?? 50, "priority", 0, 100),
    cooldown: integer(v.cooldown_seconds ?? 3600, "cooldown_seconds", 0, 604800),
    enabled: v.enabled === undefined ? true : v.enabled,
    activeFrom,
    activeTo
  };
}

const admin: RequestHandler = (req, res, next) => {
  if (!adminKey) { next(); return; }
  const supplied = req.header("x-admin-key") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(adminKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Admin key required or incorrect" });
    return;
  }
  next();
};

const beaconProjection = `
  SELECT b.beacon_number,b.place_id,b.enabled,
    p.campus,p.building,p.room_number,p.name AS place_name
  FROM simple_beacons b
  JOIN simple_places p ON p.id=b.place_id
`;

async function resolveBeacon(n: number, event: TriggerEvent | null) {
  const { rows } = await db.query(beaconProjection + " WHERE b.beacon_number=$1 AND b.enabled=true", [n]);
  if (!rows.length) throw new HttpError(404, "Beacon not registered or disabled");
  const beacon = rows[0];
  const params: unknown[] = [n, beacon.place_id];
  let eventSql = "";
  if (event) {
    params.push(event);
    eventSql = " AND c.trigger_event=$3";
  }
  const content = (await db.query(`
    SELECT c.id,c.content_type,c.trigger_event,c.title,c.body_markdown,c.action_url,
           c.priority,c.cooldown_seconds,c.active_from,c.active_to
    FROM simple_proximity_content c
    WHERE (c.beacon_number=$1 OR c.place_id=$2)
      AND c.enabled=true
      AND (c.active_from IS NULL OR c.active_from <= now())
      AND (c.active_to IS NULL OR c.active_to > now())
      ${eventSql}
    ORDER BY c.priority DESC,c.created_at ASC
  `, params)).rows;
  return {
    beacon: { number:n, uuid:ibeaconUuid, major:1, minor:n },
    location: {
      id:beacon.place_id, campus:beacon.campus, building:beacon.building,
      room_number:beacon.room_number, name:beacon.place_name
    },
    event,
    content
  };
}

app.get("/health", route(async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok" });
}));
app.get("/api/config", (_req, res) => {
  res.json({
    uuid: ibeaconUuid,
    major: 1,
    minor_is_beacon_number: true,
    proximity_events: triggerEvents,
    content_types: contentTypes
  });
});
app.get("/api/places", route(async (_req, res) => {
  const { rows } = await db.query(
    "SELECT id,campus,building,room_number,name FROM simple_places ORDER BY campus,building,room_number NULLS LAST,name"
  );
  res.json({ places:rows });
}));
app.get("/api/places/:id", route(async (req, res) => {
  const placeId = id(req.params.id);
  const { rows } = await db.query(
    "SELECT id,campus,building,room_number,name FROM simple_places WHERE id=$1",
    [placeId]
  );
  if (!rows.length) throw new HttpError(404, "Location not found");
  const content = (await db.query(`
    SELECT id,content_type,trigger_event,title,body_markdown,action_url,priority,cooldown_seconds
    FROM simple_proximity_content
    WHERE place_id=$1 AND enabled=true
      AND (active_from IS NULL OR active_from <= now())
      AND (active_to IS NULL OR active_to > now())
    ORDER BY priority DESC,created_at ASC
  `, [placeId])).rows;
  res.json({ location:rows[0], content });
}));
app.get("/api/beacons/resolve", route(async (req, res) => {
  const found = required(req.query.uuid, "uuid", 36).toLowerCase();
  if (found !== ibeaconUuid || req.query.major !== "1") throw new HttpError(404, "Unknown beacon namespace");
  const event = req.query.event === undefined ? null : choice(req.query.event, "event", triggerEvents);
  res.json(await resolveBeacon(beaconNumber(req.query.minor), event));
}));
app.get("/api/beacons/:number", route(async (req, res) => {
  const event = req.query.event === undefined ? null : choice(req.query.event, "event", triggerEvents);
  res.json(await resolveBeacon(beaconNumber(req.params.number), event));
}));

// MVP admin: no Entra yet. API binds to localhost by default.
// Set ADMIN_API_KEY before exposing it to another machine.
app.use("/api/admin", admin);

app.get("/api/admin/places", route(async (_req, res) => {
  const { rows } = await db.query(
    "SELECT id,campus,building,room_number,name,created_at,updated_at FROM simple_places ORDER BY campus,building,room_number NULLS LAST,name"
  );
  res.json({ places:rows });
}));
app.post("/api/admin/places", route(async (req, res) => {
  const p = validPlace(payload(req));
  const { rows } = await db.query(
    "INSERT INTO simple_places(campus,building,room_number,name) VALUES($1,$2,$3,$4) RETURNING id,campus,building,room_number,name",
    [p.campus,p.building,p.roomNumber,p.name]
  );
  res.status(201).json(rows[0]);
}));
app.put("/api/admin/places/:id", route(async (req, res) => {
  const p = validPlace(payload(req));
  const { rows } = await db.query(
    "UPDATE simple_places SET campus=$2,building=$3,room_number=$4,name=$5,updated_at=now() WHERE id=$1 RETURNING id,campus,building,room_number,name",
    [id(req.params.id),p.campus,p.building,p.roomNumber,p.name]
  );
  if (!rows.length) throw new HttpError(404, "Location not found");
  res.json(rows[0]);
}));

app.delete("/api/admin/places/:id", route(async (req, res) => {
  const placeId = id(req.params.id);
  const attached = await db.query("SELECT 1 FROM simple_beacons WHERE place_id=$1 LIMIT 1", [placeId]);
  if (attached.rowCount) throw new HttpError(409, "Move or delete beacons before deleting this location");
  const deleted = await db.query("DELETE FROM simple_places WHERE id=$1", [placeId]);
  if (!deleted.rowCount) throw new HttpError(404, "Location not found");
  res.status(204).end();
}));

app.get("/api/admin/beacons", route(async (_req, res) => {
  const { rows } = await db.query(beaconProjection + " ORDER BY b.beacon_number");
  res.json({ beacons:rows.map(row => ({ ...row, uuid:ibeaconUuid, major:1, minor:row.beacon_number })) });
}));
app.post("/api/admin/beacons", route(async (req, res) => {
  const v = payload(req);
  const n = beaconNumber(v.beacon_number);
  const placeId = id(v.place_id, "place_id");
  const { rows } = await db.query(
    "INSERT INTO simple_beacons(beacon_number,place_id) VALUES($1,$2) RETURNING beacon_number,place_id,enabled",
    [n,placeId]
  );
  res.status(201).json({ ...rows[0], uuid:ibeaconUuid, major:1, minor:n });
}));
app.put("/api/admin/beacons/:number", route(async (req, res) => {
  const n = beaconNumber(req.params.number);
  const v = payload(req);
  if (typeof v.enabled !== "boolean") throw new HttpError(400, "enabled must be boolean");
  const { rows } = await db.query(
    "UPDATE simple_beacons SET place_id=$2,enabled=$3,updated_at=now() WHERE beacon_number=$1 RETURNING beacon_number,place_id,enabled",
    [n,id(v.place_id, "place_id"),v.enabled]
  );
  if (!rows.length) throw new HttpError(404, "Beacon not found");
  res.json({ ...rows[0], uuid:ibeaconUuid, major:1, minor:n });
}));

app.delete("/api/admin/beacons/:number", route(async (req, res) => {
  const n = beaconNumber(req.params.number);
  // Proximity content scoped directly to the beacon is deleted by the FK cascade.
  // Location-scoped content remains attached to the location.
  const deleted = await db.query("DELETE FROM simple_beacons WHERE beacon_number=$1", [n]);
  if (!deleted.rowCount) throw new HttpError(404, "Beacon not found");
  res.status(204).end();
}));

app.get("/api/admin/content", route(async (_req, res) => {
  const { rows } = await db.query(`
    SELECT c.*,p.name AS place_name,bp.name AS beacon_place_name
    FROM simple_proximity_content c
    LEFT JOIN simple_places p ON p.id=c.place_id
    LEFT JOIN simple_beacons b ON b.beacon_number=c.beacon_number
    LEFT JOIN simple_places bp ON bp.id=b.place_id
    ORDER BY c.priority DESC,c.created_at ASC
  `);
  res.json({ content:rows });
}));
app.post("/api/admin/content", route(async (req, res) => {
  const c = validContent(payload(req));
  const { rows } = await db.query(`
    INSERT INTO simple_proximity_content(
      beacon_number,place_id,content_type,trigger_event,title,body_markdown,action_url,
      priority,cooldown_seconds,enabled,active_from,active_to
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [c.beaconNumber,c.placeId,c.contentType,c.triggerEvent,c.title,c.body,c.actionUrl,
      c.priority,c.cooldown,c.enabled,c.activeFrom,c.activeTo]);
  res.status(201).json(rows[0]);
}));
app.put("/api/admin/content/:id", route(async (req, res) => {
  const c = validContent(payload(req));
  const { rows } = await db.query(`
    UPDATE simple_proximity_content SET
      beacon_number=$2,place_id=$3,content_type=$4,trigger_event=$5,title=$6,
      body_markdown=$7,action_url=$8,priority=$9,cooldown_seconds=$10,
      enabled=$11,active_from=$12,active_to=$13,updated_at=now()
    WHERE id=$1 RETURNING *
  `, [id(req.params.id),c.beaconNumber,c.placeId,c.contentType,c.triggerEvent,c.title,
      c.body,c.actionUrl,c.priority,c.cooldown,c.enabled,c.activeFrom,c.activeTo]);
  if (!rows.length) throw new HttpError(404, "Content not found");
  res.json(rows[0]);
}));
app.delete("/api/admin/content/:id", route(async (req, res) => {
  const result = await db.query("DELETE FROM simple_proximity_content WHERE id=$1", [id(req.params.id)]);
  if (!result.rowCount) throw new HttpError(404, "Content not found");
  res.status(204).end();
}));

const errors: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error:err.message }); return; }
  if (err && typeof err === "object" && "code" in err) {
    if (err.code === "23505") { res.status(409).json({ error:"Beacon number or unique value already exists" }); return; }
    if (err.code === "23503") { res.status(404).json({ error:"Referenced beacon or location not found" }); return; }
    if (err.code === "23514") { res.status(400).json({ error:"Invalid content or scope" }); return; }
  }
  if (err instanceof SyntaxError && "body" in err) { res.status(400).json({ error:"Malformed JSON" }); return; }
  console.error(err);
  res.status(500).json({ error:"Internal server error" });
};
app.use(errors);

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, host, () => console.log(`HVL Info simple API at http://${host}:${port}`));
const shutdown = () => { server.close(() => { void db.end(); }); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
