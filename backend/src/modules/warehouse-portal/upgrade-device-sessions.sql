-- Additive, safe before deploying the new backend. Does not affect stock or ACLs.
ALTER TABLE wp_sessions ADD COLUMN IF NOT EXISTS device_key text;
CREATE INDEX IF NOT EXISTS wp_sessions_device_key_idx ON wp_sessions(device_key);
