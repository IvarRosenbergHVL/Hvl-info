import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type Request, type Response, type RequestHandler } from "express";
import { Pool } from "pg";

// Four fixed ESP32-S3 SuperMini iBeacons. The API never configures or contacts a board.
const uuid = (process.env.HVL_IBEACON_UUID ?? "").toLowerCase();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) {
  throw new Error("Set HVL_IBEACON_UUID to the UUID actually flashed on all four beacons");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const host = process.env.API_HOST ?? "127.0.0.1";
const adminKey = process.env.ADMIN_API_KEY ?? "";
if ((host !== "127.0.0.1" && host !== "::1" && host !== "localhost" || process.env.NODE_ENV === "production") && adminKey.length < 16) {
  throw new Error("ADMIN_API_KEY (at least 16 characters) is required for non-local or production API");
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req, res)).catch(next); };
function payload(req: Request): Record<string, unknown> {
  if (req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) throw new HttpError(400, "JSON object required");
  return req.body as Record<string, unknown>;
}
function required(value: unknown, name: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HttpError(400, "Invalid " + name);
  return value.trim();
}
function optional(value: unknown, name: string, max = 120): string | null {
  if (value === undefined || value === null || value === "") return null;
  return required(value, name, max);
}
function placeId(value: unknown): string {
  const valueText = required(value, "place_id", 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valueText)) throw new HttpError(400, "Invalid place_id");
  return valueText;
}
function number(value: unknown): number {
  const n = typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 65535) throw new HttpError(400, "Beacon number must be 1–65535");
  return n;
}
function pair(title: unknown, body: unknown, titleName: string, bodyName: string) {
  const a = optional(title, titleName, 120), b = optional(body, bodyName, 16000);
  if (Boolean(a) !== Boolean(b)) throw new HttpError(400, titleName + " and " + bodyName + " must both be filled in or both empty");
  return [a, b] as const;
}
function manualFields(v: Record<string, unknown>) {
  return pair(v.manual_title, v.manual_markdown, "manual_title", "manual_markdown");
}
function factFields(v: Record<string, unknown>) {
  return pair(v.fun_fact_title, v.fun_fact_text, "fun_fact_title", "fun_fact_text");
}
function validPlace(v: Record<string, unknown>) {
  return {
    campus: required(v.campus, "campus"),
    building: required(v.building, "building"),
    room_number: optional(v.room_number, "room_number", 40),
    name: required(v.name, "name"),
    manual: manualFields(v)
  };
}
const admin: RequestHandler = (req, res, next) => {
  if (!adminKey) { next(); return; } // Only allowed in local development by startup check.
  const supplied = req.header("x-admin-key") ?? "";
  const a = Buffer.from(supplied), b = Buffer.from(adminKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Admin key required or incorrect" }); return;
  }
  next();
};
const projection = `
  SELECT b.beacon_number,b.place_id,b.fun_fact_title,b.fun_fact_text,b.enabled,
    p.campus,p.building,p.room_number,p.name AS place_name,
    p.manual_title,p.manual_markdown
  FROM simple_beacons b JOIN simple_places p ON p.id=b.place_id
`;
function publicResult(row: Record<string, unknown>) {
  return {
    beacon: { number: row.beacon_number, uuid, major: 1, minor: row.beacon_number },
    location: { id: row.place_id, campus: row.campus, building: row.building, room_number: row.room_number, name: row.place_name },
    fun_fact: row.fun_fact_title ? { title: row.fun_fact_title, text: row.fun_fact_text } : null,
    manual: row.manual_title ? { title: row.manual_title, markdown: row.manual_markdown } : null
  };
}
app.get("/health", route(async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok" });
}));
app.get("/api/config", (_req, res) => res.json({ uuid, major: 1, minor_is_beacon_number: true }));
app.get("/api/places", route(async (_req, res) => {
  const { rows } = await db.query("SELECT id,campus,building,room_number,name FROM simple_places ORDER BY campus,building,room_number NULLS LAST,name");
  res.json({ places: rows });
}));
app.get("/api/places/:id", route(async (req, res) => {
  const id = placeId(req.params.id);
  const { rows } = await db.query("SELECT id,campus,building,room_number,name,manual_title,manual_markdown FROM simple_places WHERE id=$1", [id]);
  if (!rows.length) throw new HttpError(404, "Location not found");
  const p = rows[0];
  res.json({ location: { id:p.id,campus:p.campus,building:p.building,room_number:p.room_number,name:p.name },
    manual: p.manual_title ? { title:p.manual_title,markdown:p.manual_markdown } : null });
}));
async function lookup(n: number, res: Response) {
  const { rows } = await db.query(projection + " WHERE b.beacon_number=$1 AND b.enabled=true", [n]);
  if (!rows.length) throw new HttpError(404, "Beacon not registered or disabled");
  res.json(publicResult(rows[0]));
}
app.get("/api/beacons/resolve", route(async (req, res) => {
  const found = required(req.query.uuid, "uuid", 36).toLowerCase();
  const major = req.query.major;
  if (found !== uuid || major !== "1") throw new HttpError(404, "Unknown beacon namespace");
  await lookup(number(req.query.minor), res);
}));
app.get("/api/beacons/:number", route(async (req, res) => {
  await lookup(number(req.params.number), res);
}));
// No Entra for the MVP. Localhost-only by default; set a server-side key
// before exposing the API beyond the development machine.
app.use("/api/admin", admin);
app.get("/api/admin/places", route(async (_req, res) => {
  const { rows } = await db.query("SELECT * FROM simple_places ORDER BY campus,building,room_number NULLS LAST,name");
  res.json({ places: rows });
}));
app.post("/api/admin/places", route(async (req, res) => {
  const p = validPlace(payload(req));
  const { rows } = await db.query(
    "INSERT INTO simple_places(campus,building,room_number,name,manual_title,manual_markdown) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [p.campus,p.building,p.room_number,p.name,...p.manual]);
  res.status(201).json(rows[0]);
}));
app.put("/api/admin/places/:id", route(async (req, res) => {
  const p = validPlace(payload(req));
  const { rows } = await db.query(
    "UPDATE simple_places SET campus=$2,building=$3,room_number=$4,name=$5,manual_title=$6,manual_markdown=$7,updated_at=now() WHERE id=$1 RETURNING *",
    [placeId(req.params.id),p.campus,p.building,p.room_number,p.name,...p.manual]);
  if (!rows.length) throw new HttpError(404, "Location not found");
  res.json(rows[0]);
}));
app.get("/api/admin/beacons", route(async (_req, res) => {
  const { rows } = await db.query(projection + " ORDER BY b.beacon_number");
  res.json({ beacons: rows.map(row => ({ ...row, uuid, major: 1, minor: row.beacon_number })) });
}));
app.post("/api/admin/beacons", route(async (req, res) => {
  const v = payload(req), n = number(v.beacon_number), id = placeId(v.place_id);
  const [title, text] = factFields(v);
  const { rows } = await db.query(
    "INSERT INTO simple_beacons(beacon_number,place_id,fun_fact_title,fun_fact_text) VALUES($1,$2,$3,$4) RETURNING *",
    [n,id,title,text]);
  res.status(201).json({ ...rows[0], uuid, major: 1, minor: n });
}));
app.put("/api/admin/beacons/:number", route(async (req, res) => {
  const n = number(req.params.number), v = payload(req), id = placeId(v.place_id);
  if (typeof v.enabled !== "boolean") throw new HttpError(400, "enabled must be a boolean");
  const [title, text] = factFields(v);
  const { rows } = await db.query(
    "UPDATE simple_beacons SET place_id=$2,fun_fact_title=$3,fun_fact_text=$4,enabled=$5,updated_at=now() WHERE beacon_number=$1 RETURNING *",
    [n,id,title,text,v.enabled]);
  if (!rows.length) throw new HttpError(404, "Beacon not found");
  res.json({ ...rows[0], uuid, major: 1, minor: n });
}));
const errors: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err && typeof err === "object" && "code" in err) {
    if (err.code === "23505") { res.status(409).json({ error: "Beacon number or other unique value already registered" }); return; }
    if (err.code === "23503") { res.status(404).json({ error: "Location not found" }); return; }
    if (err.code === "23514") { res.status(400).json({ error: "Invalid content combination" }); return; }
  }
  if (err instanceof SyntaxError && "body" in err) { res.status(400).json({ error: "Malformed JSON" }); return; }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errors);
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, host, () => console.log(`HVL Info simple API at http://${host}:${port}`));
const shutdown = () => { server.close(() => { void db.end(); }); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
