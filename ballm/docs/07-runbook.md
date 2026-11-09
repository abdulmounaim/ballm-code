# Runbook

## Onboard a developer

1. Install Ballm Code from the internal artifact store.
2. Confirm the managed policy is present (`/etc/opencode/opencode.jsonc` or the MDM profile).
3. Start the client and run the integration dialog.
4. Choose **Ballm** and open the device URL.
5. Sign in with the corporate identity provider.
6. Approve the device code and return to the client.
7. Verify the model picker contains only Ballm models.

## Offboard a developer

1. Disable the user in the identity provider.
2. Revoke all sessions in the control plane:
   `POST /auth/device/revoke` for each token, or disable the user row.
3. Confirm the next gateway request returns 401.
4. The client reports `needs_auth` on the next config poll.

## Rotate upstream credentials

1. Set the new key in the gateway secret store.
2. Restart or hot-reload the control plane.
3. Confirm `GET /v1/models` succeeds.
4. Keep the old key valid for the overlap window, then remove it.

## Diagnose "no models"

1. Check `opencode service status` and the server log.
2. Check the integration dialog for `needs_auth` or a status message.
3. Call the backend directly:
   `curl -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" $BALLM_PUBLIC_URL/api/v2/config`
4. Confirm the response has a `ballm` provider with models.
5. Confirm managed policy allows `provider.use: ballm` and `integration.use: ballm*`.

## Diagnose a gateway 502

1. Confirm `UPSTREAM_BASE_URL` and `UPSTREAM_API_KEY` are set.
2. Call the upstream directly from the control-plane host.
3. Check the audit table for the request.
4. If `BALLM_DEV_ECHO=1` is set in production, unset it.

## Backups

- Back up the SQLite database (users, orgs, tokens, audit).
- Tokens are stored as hashes; restoring the database restores access.
- Back up managed policy artifacts and the release manifest separately.

## Emergency lockout

1. Deny `provider.use: *` in the managed policy and push via MDM.
2. Revoke all tokens.
3. Rotate the upstream key.
4. Roll back the client to the previous release if the issue is client-side.
