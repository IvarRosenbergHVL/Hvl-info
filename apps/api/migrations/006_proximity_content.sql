-- Generic content triggered by proximity events in the mobile app.
-- The phone decides when enter/near/exit happens; backend only maps that event to content.
CREATE TABLE simple_proximity_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beacon_number integer REFERENCES simple_beacons(beacon_number) ON DELETE CASCADE,
  place_id uuid REFERENCES simple_places(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('fun_fact','manual','message','link')),
  trigger_event text NOT NULL CHECK (trigger_event IN ('enter','near','exit')),
  title text NOT NULL,
  body_markdown text,
  action_url text,
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  cooldown_seconds integer NOT NULL DEFAULT 3600 CHECK (cooldown_seconds BETWEEN 0 AND 604800),
  enabled boolean NOT NULL DEFAULT true,
  active_from timestamptz,
  active_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simple_content_one_scope CHECK (
    (beacon_number IS NOT NULL AND place_id IS NULL) OR
    (beacon_number IS NULL AND place_id IS NOT NULL)
  ),
  CONSTRAINT simple_content_active_window CHECK (
    active_to IS NULL OR active_from IS NULL OR active_to > active_from
  ),
  CONSTRAINT simple_content_link_url CHECK (
    content_type <> 'link' OR action_url IS NOT NULL
  )
);
CREATE INDEX simple_content_beacon_idx ON simple_proximity_content(beacon_number)
  WHERE beacon_number IS NOT NULL;
CREATE INDEX simple_content_place_idx ON simple_proximity_content(place_id)
  WHERE place_id IS NOT NULL;

-- Preserve content already entered in the first simple MVP schema.
INSERT INTO simple_proximity_content(
  beacon_number,content_type,trigger_event,title,body_markdown,priority,cooldown_seconds
)
SELECT beacon_number,'fun_fact','enter',fun_fact_title,fun_fact_text,50,86400
FROM simple_beacons
WHERE fun_fact_title IS NOT NULL AND fun_fact_text IS NOT NULL;

INSERT INTO simple_proximity_content(
  place_id,content_type,trigger_event,title,body_markdown,priority,cooldown_seconds
)
SELECT id,'manual','near',manual_title,manual_markdown,80,3600
FROM simple_places
WHERE manual_title IS NOT NULL AND manual_markdown IS NOT NULL;
