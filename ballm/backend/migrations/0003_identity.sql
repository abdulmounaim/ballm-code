-- Individual and team workspaces, password identity, and invitations.
-- Forward-only; see packages/platform/src/db/migrate.ts.

-- A workspace is either an individual's personal space or a team. Personal workspaces give every
-- account the same org-scoped models, policies, usage and sessions that teams already use.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'team';
ALTER TABLE orgs DROP CONSTRAINT IF EXISTS orgs_kind_check;
ALTER TABLE orgs ADD CONSTRAINT orgs_kind_check CHECK (kind IN ('personal', 'team'));
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS sso_enforced boolean NOT NULL DEFAULT false;

-- One personal workspace per user. Team workspaces are not covered by the index.
CREATE UNIQUE INDEX IF NOT EXISTS orgs_personal_owner_idx
  ON orgs (created_by) WHERE kind = 'personal' AND created_by IS NOT NULL;

-- Password identities are owned by Ory Kratos; the platform stores its stable identity id and
-- whether the address has been verified. `handle` names the personal workspace.
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_identity_id_key
  ON users (identity_id) WHERE identity_id IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle text;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_key
  ON users (lower(handle)) WHERE handle IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- Password sign-in issues the same platform sessions as device approval and SSO.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_auth_method_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_auth_method_check
  CHECK (auth_method IN ('device', 'sso', 'dev', 'password'));

-- Invitations are the only way into a team workspace. The raw token is never stored.
CREATE TABLE IF NOT EXISTS invites (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  token_hash text NOT NULL UNIQUE,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS invites_org_idx ON invites (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS invites_pending_idx
  ON invites (org_id, lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Carries device approval and invitation context through a hosted identity flow, the same way
-- oidc_states carries it through OIDC. Consumed exactly once.
CREATE TABLE IF NOT EXISTS auth_states (
  state text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('login', 'registration', 'recovery', 'verification', 'settings')),
  device_code_hash text,
  user_code text,
  invite_id text REFERENCES invites(id) ON DELETE SET NULL,
  return_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_states_expiry_idx ON auth_states (expires_at);
