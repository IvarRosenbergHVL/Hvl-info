/**
 * Stable iBeacon identity used by HVL Info. The BLE MAC address is not the
 * application identity; it may be randomized and is not a reliable lookup key.
 */
export type IBeaconIdentity = {
  uuid: string;
  major: number;
  minor: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseIBeaconIdentity(input: unknown): IBeaconIdentity {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("iBeacon identity must be an object");
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.uuid !== "string" || !UUID_RE.test(candidate.uuid)) {
    throw new TypeError("Invalid iBeacon UUID");
  }
  for (const name of ["major", "minor"] as const) {
    const value = candidate[name];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65535) {
      throw new TypeError(`Invalid iBeacon ${name}; expected integer 0–65535`);
    }
  }
  return {
    uuid: candidate.uuid.toLowerCase(),
    major: candidate.major as number,
    minor: candidate.minor as number,
  };
}

/** Apple manufacturer-specific data only (25 bytes), excluding the BLE AD header. */
export function encodeIBeaconManufacturerData(identity: IBeaconIdentity, measuredPower: number): Uint8Array {
  const parsed = parseIBeaconIdentity(identity);
  if (!Number.isInteger(measuredPower) || measuredPower < -128 || measuredPower > 127) {
    throw new RangeError("Measured power must be an int8");
  }
  const uuidBytes = parsed.uuid.replace(/-/g, "").match(/../g)!;
  return Uint8Array.from([
    0x4c, 0x00, 0x02, 0x15,
    ...uuidBytes.map((byte) => Number.parseInt(byte, 16)),
    (parsed.major >> 8) & 0xff, parsed.major & 0xff,
    (parsed.minor >> 8) & 0xff, parsed.minor & 0xff,
    measuredPower & 0xff,
  ]);
}

export function decodeIBeaconManufacturerData(bytes: Uint8Array): IBeaconIdentity & { measuredPower: number } {
  if (bytes.length !== 25 || bytes[0] !== 0x4c || bytes[1] !== 0x00 || bytes[2] !== 0x02 || bytes[3] !== 0x15) {
    throw new TypeError("Not a 25-byte iBeacon manufacturer payload");
  }
  const hex = [...bytes.slice(4, 20)].map(b => b.toString(16).padStart(2, "0")).join("");
  const uuid = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  return {
    uuid,
    major: (bytes[20] << 8) | bytes[21],
    minor: (bytes[22] << 8) | bytes[23],
    measuredPower: bytes[24] > 127 ? bytes[24] - 256 : bytes[24],
  };
}
