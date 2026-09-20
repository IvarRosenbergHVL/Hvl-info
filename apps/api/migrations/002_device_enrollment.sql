-- 002: local AP enrollment followed by short, periodic HTTPS check-ins.
ALTER TABLE beacon_devices ADD COLUMN friendly_name text;
ALTER TABLE beacon_devices ADD COLUMN firmware_version text;
ALTER TABLE beacon_devices ADD COLUMN provisioned_at timestamptz;
ALTER TABLE beacon_devices ADD COLUMN last_seen_at timestamptz;
ALTER TABLE beacon_devices ADD COLUMN config_version integer NOT NULL DEFAULT 1;
ALTER TABLE beacon_devices ADD COLUMN reported_version integer;
CREATE TABLE device_provisioning_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES beacon_devices(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  issued_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON device_provisioning_tokens(device_id);
CREATE TABLE device_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES beacon_devices(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX one_live_device_credential ON device_credentials(device_id) WHERE revoked_at IS NULL;
