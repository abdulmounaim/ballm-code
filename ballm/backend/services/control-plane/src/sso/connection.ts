import type { OidcConnection } from "./oidc"
import type { SecretBox } from "@ballm/platform/secrets"
import type { SsoRow } from "../store"

export function oidcConnection(row: SsoRow, secrets: SecretBox): OidcConnection {
  return {
    issuer: row.issuer,
    clientId: row.client_id,
    clientSecret: secrets.open(row.encrypted_client_secret),
    scopes: row.scopes,
    allowedDomains: row.allowed_domains,
    groupClaim: row.group_claim ?? undefined,
    groupRoles: row.group_roles,
  }
}
