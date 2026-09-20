-- Keep technician confirmation separate from merely provisioning a device.
ALTER TABLE beacon_devices ADD COLUMN verified_at timestamptz;
ALTER TABLE beacon_devices ADD COLUMN verified_by text;
ALTER TABLE beacon_devices ADD COLUMN verified_config_version integer;
