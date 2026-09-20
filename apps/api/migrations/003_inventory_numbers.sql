-- 003: printed enclosure number is the admin-facing inventory identity.
-- Hardware ID is bound on first secure enrollment; it is not entered in admin.
ALTER TABLE beacon_devices ADD COLUMN inventory_number bigint
  CHECK (inventory_number > 0);
CREATE UNIQUE INDEX beacon_devices_inventory_number_unique
  ON beacon_devices (inventory_number) WHERE inventory_number IS NOT NULL;
ALTER TABLE beacon_devices ALTER COLUMN hardware_id DROP NOT NULL;
CREATE SEQUENCE beacon_identity_seq AS bigint START WITH 1
  MINVALUE 1 MAXVALUE 4294967295 NO CYCLE;
-- Existing manually registered devices remain with their hardware IDs and
-- no assigned enclosure number until explicitly reconciled. No destructive
-- migration or guessed mapping between old hardware and printed numbers.
