// Destructive write/read integration smoke test for a dedicated LOCAL MVP database.
// Run only when you explicitly opt in: SMOKE_ALLOW_WRITES=yes npm run smoke:mvp.
// Uses only Node.js built-ins; backend and PostgreSQL must already be running.
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";

if (process.env.SMOKE_ALLOW_WRITES !== "yes") {
  throw new Error("This test writes and deletes test records. Set SMOKE_ALLOW_WRITES=yes on a dedicated local database.");
}
const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const url = new URL(base);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) || url.protocol !== "http:") {
  throw new Error("Smoke tests are permitted only against localhost HTTP");
}
const key = process.env.ADMIN_API_KEY ?? "";
const number = randomInt(50000, 65000);
let placeId = null;
let createdBeacon = false;
const contentIds = [];
const cleanupErrors = [];

async function request(path, method = "GET", value, expected = 200) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(key ? { "X-Admin-Key": key } : {}),
      ...(value === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: value === undefined ? undefined : JSON.stringify(value)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.equal(response.status, expected, method + " " + path + " expected " + expected + ", got " + response.status + ": " + text);
  return data;
}
function contentData(type, event, title, scope, extra = {}) {
  return {
    beacon_number: scope === "beacon" ? number : null,
    place_id: scope === "location" ? placeId : null,
    content_type: type,
    trigger_event: event,
    title,
    body_markdown: "MVP smoke test",
    priority: 50,
    cooldown_seconds: 3600,
    enabled: true,
    ...extra
  };
}

try {
  const health = await request("/health");
  assert.equal(health.status, "ok");
  const config = await request("/api/config");
  assert.equal(config.major, 1);
  assert.equal(config.uuid, process.env.HVL_IBEACON_UUID?.toLowerCase());

  const location = await request("/api/admin/places", "POST", {
    campus: "Smoke test", building: "Temporary",
    room_number: String(number), name: "Temporary " + number
  }, 201);
  placeId = location.id;

  const beacon = await request("/api/admin/beacons", "POST", {
    beacon_number: number, place_id: placeId
  }, 201);
  createdBeacon = true;
  assert.equal(beacon.minor, number);
  assert.equal(beacon.major, 1);

  const fact = await request("/api/admin/content", "POST",
    contentData("fun_fact", "enter", "Smoke fact", "beacon"), 201);
  contentIds.push(fact.id);

  const manual = await request("/api/admin/content", "POST",
    contentData("manual", "near", "Smoke manual", "location", { priority: 80 }), 201);
  contentIds.push(manual.id);

  await request("/api/admin/content", "POST",
    contentData("link", "near", "Bad URL", "beacon", { action_url:"javascript:alert(1)" }), 400);

  const enter = await request("/api/beacons/" + number + "?event=enter");
  assert.equal(enter.content.length, 1);
  assert.equal(enter.content[0].title, "Smoke fact");
  const near = await request(
    "/api/beacons/resolve?uuid=" + encodeURIComponent(config.uuid) +
    "&major=1&minor=" + number + "&event=near"
  );
  assert.equal(near.content.length, 1);
  assert.equal(near.content[0].title, "Smoke manual");
  assert.equal(near.location.id, placeId);

  await request(
    "/api/beacons/resolve?uuid=00000000-0000-0000-0000-000000000000&major=1&minor=" +
    number + "&event=near", "GET", undefined, 404
  );

  await request("/api/admin/beacons/" + number, "PUT", {
    place_id: placeId, enabled: false
  });
  await request("/api/beacons/" + number + "?event=enter", "GET", undefined, 404);
  await request("/api/admin/beacons/" + number, "PUT", {
    place_id: placeId, enabled: true
  });

  await request("/api/admin/content/" + fact.id, "PUT",
    contentData("fun_fact", "enter", "Smoke updated", "beacon"));
  const updated = await request("/api/beacons/" + number + "?event=enter");
  assert.equal(updated.content[0].title, "Smoke updated");

} finally {
  for (const contentId of contentIds.reverse()) {
    try { await request("/api/admin/content/" + contentId, "DELETE", undefined, 204); }
    catch (error) { cleanupErrors.push(error); console.error("Could not clean up content:", contentId, error); }
  }
  if (createdBeacon) {
    try { await request("/api/admin/beacons/" + number, "DELETE", undefined, 204); }
    catch (error) { cleanupErrors.push(error); console.error("Could not clean up beacon:", number, error); }
  }
  if (placeId) {
    try { await request("/api/admin/places/" + placeId, "DELETE", undefined, 204); }
    catch (error) { cleanupErrors.push(error); console.error("Could not clean up location:", placeId, error); }
  }
}

if (cleanupErrors.length) throw new Error("Smoke test cleanup failed. Inspect the local test database.");
console.log("PASS: health, config, place/beacon CRUD, iBeacon identity, event filtering, location content, URL rejection, disable, update, cleanup");
