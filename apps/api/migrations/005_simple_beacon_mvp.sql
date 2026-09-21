-- Isolated four-beacon MVP; leave the earlier provisioning tables and data untouched.
-- Firmware owns a fixed identity: one shared UUID, Major=1, Minor=beacon number.
CREATE TABLE simple_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus text NOT NULL,
  building text NOT NULL,
  room_number text,
  name text NOT NULL,
  manual_title text,
  manual_markdown text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simple_place_manual_pair CHECK (
    (manual_title IS NULL AND manual_markdown IS NULL) OR
    (manual_title IS NOT NULL AND manual_markdown IS NOT NULL)
  )
);

CREATE TABLE simple_beacons (
  beacon_number integer PRIMARY KEY CHECK (beacon_number BETWEEN 1 AND 65535),
  place_id uuid NOT NULL REFERENCES simple_places(id),
  fun_fact_title text,
  fun_fact_text text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simple_beacon_fact_pair CHECK (
    (fun_fact_title IS NULL AND fun_fact_text IS NULL) OR
    (fun_fact_title IS NOT NULL AND fun_fact_text IS NOT NULL)
  )
);
CREATE INDEX simple_beacons_place_idx ON simple_beacons(place_id);
