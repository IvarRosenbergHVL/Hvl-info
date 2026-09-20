import assert from "node:assert/strict";
import test from "node:test";
import { decodeIBeaconManufacturerData, encodeIBeaconManufacturerData, parseIBeaconIdentity } from "./index.js";

test("iBeacon payload follows Apple byte ordering and roundtrips", () => {
  const identity = { uuid: "00112233-4455-6677-8899-aabbccddeeff", major: 100, minor: 204 };
  const bytes = encodeIBeaconManufacturerData(identity, -59);
  assert.equal(Buffer.from(bytes).toString("hex"),
    "4c00021500112233445566778899aabbccddeeff006400ccc5");
  assert.deepEqual(decodeIBeaconManufacturerData(bytes), { ...identity, measuredPower: -59 });
});

test("rejects malformed or out-of-range identities and fake payloads", () => {
  assert.throws(() => parseIBeaconIdentity({ uuid: "wrong", major: 0, minor: 1 }));
  assert.throws(() => parseIBeaconIdentity({ uuid: "00112233-4455-6677-8899-aabbccddeeff", major: -1, minor: 1 }));
  assert.throws(() => parseIBeaconIdentity({ uuid: "00112233-4455-6677-8899-aabbccddeeff", major: 0, minor: 65536 }));
  assert.throws(() => decodeIBeaconManufacturerData(new Uint8Array(25)));
});
