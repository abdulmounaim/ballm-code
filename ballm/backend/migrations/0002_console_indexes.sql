-- Console read paths. Partial indexes keep the hot active-session queries small as history grows.

CREATE INDEX IF NOT EXISTS sessions_org_active_idx
  ON sessions (org_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS browser_sessions_expiry_idx
  ON browser_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS usage_events_org_status_at_idx
  ON usage_events (org_id, status, at DESC);
