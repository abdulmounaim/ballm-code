# Runbook

## Onboard a developer

1. Install Ballm Code from the internal artifact store.
2. Confirm the managed policy is present (`/etc/opencode/opencode.jsonc` or the MDM profile).
3. Give the person a role in `/console/members`.
4. Start the client and run the integration dialog.
5. Choose **Ballm** and open the device URL.
6. Sign in with the corporate identity provider.
7. Approve the device code and return to the client.
8. Verify the model picker contains only Ballm models.

The user must already exist in the identity provider and match an organization's allowed email
domain, or have a membership created through the admin API.

## Offboard a developer

1. Disable the user in the identity provider.
2. Remove them from the organization in `/console/members`, or revoke every session:

   ```sh
   curl -X POST "$BALLM_PUBLIC_URL/api/v1/admin/users/<userId>/revoke" \
     -H "authorization: Bearer $BALLM_ADMIN_TOKEN"
   ```

   Both paths mark sessions and refresh tokens revoked and write `ballm:revoked:<sid>` to Redis.
3. Confirm the next gateway request returns 401.
4. The client reports `needs_auth` on the next config poll.

If Redis is not replicated across regions, access tokens outside the region that handled the
revocation remain valid until `BALLM_ACCESS_TTL` expires (five minutes by default).

## Rotate upstream credentials

1. Update the organization upstream through the admin API:

   ```sh
   curl -X PUT "$BALLM_PUBLIC_URL/api/v1/admin/orgs/<orgId>/upstream" \
     -H "authorization: Bearer $BALLM_ADMIN_TOKEN" \
     -H "content-type: application/json" \
     -d '{"baseUrl":"https://upstream.example/v1","apiKey":"new-key"}'
   ```

2. The admin API seals the key and publishes `ballm:invalidate`; gateways clear their catalog cache.
3. Confirm `GET /v1/models` succeeds through each regional gateway.
4. Keep the old key valid for the overlap window, then remove it upstream.

## Rotate signing keys

1. Generate a new key pair with `bun run keys --force`.
2. Add the new key to the control plane secret and deploy it; the JWKS endpoint serves the new `kid`.
3. Deploy gateways with the new public key, or let JWKS refresh.
4. Short-lived access tokens make the overlap safe.

## Diagnose console access

1. `GET /console/` returning `503` means the assets are missing. Set `BALLM_CONSOLE_DIR` or build
   them with `make -C ballm console`.
2. A sign-in loop usually means the IdP redirect URI is not
   `$BALLM_PUBLIC_URL/auth/sso/callback`, or the email domain is not in the organization's allowed
   domains.
3. `403` on a save usually means the CSRF token expired after a key rotation or a stale tab. Reload
   the console.
4. A user who can sign in but sees only their account has the `member` role. Promote them in
   `/console/members`.
5. Check the browser console for CSP violations; do not relax the policy with `unsafe-eval` or
   third-party scripts.

## Diagnose "no models"

1. Check `opencode service status` and the server log.
2. Check the integration dialog for `needs_auth` or a status message.
3. Call the platform directly:

   ```sh
   curl -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" "$BALLM_PUBLIC_URL/api/v2/config"
   ```

4. Confirm the response has a `ballm` provider with models.
5. Confirm managed policy allows `provider.use: ballm` and `integration.use: ballm*`.
6. Confirm the org has rows in `org_models` and `model_catalog`.

## Diagnose a gateway 502/503

1. `503` usually means the org has no upstream configured. Check `org_settings`, then the
   `BALLM_UPSTREAM_BASE_URL` fallback.
2. `502` means the upstream was unreachable or returned an invalid response. Test it from a gateway
   pod, not from your laptop.
3. Check `/metrics` on the gateway for `ballm_upstream_requests_total` and latency.
4. Inspect `usage_events` for the request id and status.
5. Check the gateway log for the `x-request-id` from the response.

## Diagnose SSO

1. Confirm discovery works from the control-plane pod:
   `curl "$ISSUER/.well-known/openid-configuration"`.
2. Confirm the IdP redirect URI is `$BALLM_PUBLIC_URL/auth/sso/callback`.
3. Confirm the email domain is in `allowed_domains`.
4. Check that the ID token contains `email`, `email_verified`, and the configured group claim.
5. A `403` after callback is usually an allowed-domain or group-mapping problem.

## Backups

- Back up PostgreSQL with your normal PITR tooling. `users`, `orgs`, `sessions`, `refresh_tokens`,
  `sso_connections`, `model_catalog`, `org_models`, `org_policies`, `org_settings`, and
  `audit_events`/`usage_events` are all in the primary.
- Refresh tokens are hashed; restoring the database restores access.
- Back up the JWT signing keys, the encryption key, and managed policy artifacts separately.
- `audit_events` and `usage_events` are partitioned by month; include all partitions.

## Multi-region failover

1. Promote the regional Postgres replica.
2. Point the control plane and gateway `DATABASE_URL` at the promoted primary.
3. Point `DATABASE_READ_URL` in other regions at their replicas.
4. Gateways keep serving with cached catalogs and local JWT verification during the cutover.
5. Re-run the migration Job only if the promoted database is behind.

## Emergency lockout

1. Deny `provider.use: *` in the managed policy and push via MDM.
2. Revoke all sessions for affected users, or deny the organization's models:
   `PUT /api/v1/admin/orgs/<orgId>/models` with an empty list.
3. Rotate upstream keys.
4. Roll back the client to the previous release if the issue is client-side.
