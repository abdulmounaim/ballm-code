import type { ConsoleOrg, ConsoleUser, Role } from "./store"

export interface ConsoleContext {
  readonly user: ConsoleUser
  readonly sessionId: string
  readonly browserOrgId: string
  readonly orgId: string
  readonly org: ConsoleOrg
  readonly role: Role
  readonly csrf: string
}
