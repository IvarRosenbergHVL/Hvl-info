-- Baseline domain model. No movement log and no Entra password storage.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus text NOT NULL,
  building text NOT NULL,
  floor text,
  room_number text,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('room', 'area', 'service', 'equipment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campus, building, room_number)
);

CREATE TABLE beacon_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hardware_id text NOT NULL UNIQUE,
  asset_tag text,
  model text NOT NULL DEFAULT 'ESP32-C3 SuperMini',
  state text NOT NULL DEFAULT 'registered'
    CHECK (state IN ('registered', 'placed', 'active', 'disabled')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE beacon_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES beacon_devices(id),
  place_id uuid NOT NULL REFERENCES places(id),
  role text NOT NULL CHECK (role IN ('classroom_equipment', 'area', 'service', 'equipment')),
  mounted_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX one_active_placement_per_device
  ON beacon_placements(device_id) WHERE removed_at IS NULL;

CREATE TABLE beacon_identities (
  device_id uuid PRIMARY KEY REFERENCES beacon_devices(id),
  beacon_uuid uuid NOT NULL,
  major integer NOT NULL CHECK (major BETWEEN 0 AND 65535),
  minor integer NOT NULL CHECK (minor BETWEEN 0 AND 65535),
  measured_power integer NOT NULL DEFAULT -59 CHECK (measured_power BETWEEN -128 AND 127),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beacon_uuid, major, minor)
);

CREATE TABLE guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES places(id),
  title text NOT NULL,
  url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES places(id),
  equipment_name text,
  title text NOT NULL,
  workaround text,
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_oid text NOT NULL,
  action text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
