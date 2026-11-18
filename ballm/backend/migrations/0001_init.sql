-- Ballm platform schema. Forward-only; see packages/platform/src/db/migrate.ts.

CREATE TABLE IF NOT EXISTS orgs (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS memberships (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);
CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships (org_id);

CREATE TABLE IF NOT EXISTS sso_connections (
  org_id text PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  client_id text NOT NULL,
  encrypted_client_secret text NOT NULL,
  scopes text NOT NULL DEFAULT 'openid email profile',
  allowed_domains text[] NOT NULL DEFAULT '{}',
  group_claim text,
  group_roles jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sso_connections_domains_idx ON sso_connections USING gin (allowed_domains);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  auth_method text NOT NULL CHECK (auth_method IN ('device', 'sso', 'dev')),
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_org_idx ON sessions (org_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  family_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_session_idx ON refresh_tokens (session_id);

CREATE TABLE IF NOT EXISTS device_codes (
  device_code_hash text PRIMARY KEY,
  user_code text NOT NULL UNIQUE,
  client_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'claimed', 'denied', 'expired')),
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  org_id text REFERENCES orgs(id) ON DELETE SET NULL,
  session_id text REFERENCES sessions(id) ON DELETE SET NULL,
  interval_seconds integer NOT NULL DEFAULT 5,
  last_polled_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS device_codes_user_code_idx ON device_codes (user_code);
CREATE INDEX IF NOT EXISTS device_codes_expiry_idx ON device_codes (expires_at);

CREATE TABLE IF NOT EXISTS oidc_states (
  state text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  device_code_hash text,
  user_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oidc_states_expiry_idx ON oidc_states (expires_at);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS browser_sessions_user_idx ON browser_sessions (user_id);

CREATE TABLE IF NOT EXISTS model_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  upstream_model text NOT NULL,
  context_limit integer,
  output_limit integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_models (
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  model_id text NOT NULL REFERENCES model_catalog(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, model_id)
);
CREATE INDEX IF NOT EXISTS org_models_model_idx ON org_models (model_id);

CREATE TABLE IF NOT EXISTS org_policies (
  org_id text PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_settings (
  org_id text PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  upstream_base_url text,
  encrypted_upstream_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial,
  at timestamptz NOT NULL DEFAULT now(),
  org_id text,
  user_id text,
  session_id text,
  kind text NOT NULL,
  detail jsonb,
  PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);
CREATE TABLE IF NOT EXISTS audit_events_default PARTITION OF audit_events DEFAULT;
CREATE INDEX IF NOT EXISTS audit_events_org_at_idx ON audit_events (org_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_events_kind_at_idx ON audit_events (kind, at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial,
  at timestamptz NOT NULL DEFAULT now(),
  org_id text NOT NULL,
  user_id text NOT NULL,
  session_id text,
  model_id text NOT NULL,
  upstream_model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  latency_ms integer,
  status integer NOT NULL,
  request_id text,
  PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);
CREATE TABLE IF NOT EXISTS usage_events_default PARTITION OF usage_events DEFAULT;
CREATE INDEX IF NOT EXISTS usage_events_org_at_idx ON usage_events (org_id, at DESC);
CREATE INDEX IF NOT EXISTS usage_events_model_at_idx ON usage_events (model_id, at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_at_idx ON usage_events (user_id, at DESC);
