import {
  createContext,
  createSignal,
  onMount,
  useContext,
  type JSX,
} from "solid-js"
import { ApiError, api, type RequestInput } from "./api"
import type { Capabilities, Org, Session, User } from "./types"

type Status = "loading" | "ready" | "signed-out" | "error"

const ORG_KEY = "ballm.console.org"

const emptyCapabilities: Capabilities = {
  manageMembers: false,
  manageOwners: false,
  manageModels: false,
  managePolicies: false,
  manageSso: false,
  manageUpstream: false,
  viewAudit: false,
  viewUsage: false,
}

interface SessionApi {
  session: () => Session | undefined
  user: () => User | undefined
  org: () => Org | undefined
  status: () => Status
  error: () => string | undefined
  orgId: () => string | undefined
  can: () => Capabilities
  auth: () => Session["auth"] | undefined
  request: <T>(path: string, input?: Omit<RequestInput, "orgId" | "csrf">) => Promise<T>
  switchOrg: (id: string) => Promise<void>
  signOut: () => Promise<void>
  reload: () => Promise<void>
}

const SessionContext = createContext<SessionApi>()

export function SessionProvider(props: { children: JSX.Element }) {
  const [session, setSession] = createSignal<Session>()
  const [status, setStatus] = createSignal<Status>("loading")
  const [error, setError] = createSignal<string>()
  const [orgId, setOrgId] = createSignal<string | undefined>(localStorage.getItem(ORG_KEY) ?? undefined)

  const reload = async () => {
    try {
      const next = await api<Session>("/api/console/session", { orgId: orgId() })
      setSession(next)
      setOrgId(next.org.id)
      localStorage.setItem(ORG_KEY, next.org.id)
      setError(undefined)
      setStatus("ready")
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setSession(undefined)
        setStatus("signed-out")
        return
      }
      if (cause instanceof ApiError && cause.status === 403 && orgId()) {
        localStorage.removeItem(ORG_KEY)
        setOrgId(undefined)
        return reload()
      }
      setError(cause instanceof Error ? cause.message : "Unable to load the console")
      setStatus("error")
    }
  }

  const request = async <T,>(path: string, input: Omit<RequestInput, "orgId" | "csrf"> = {}) => {
    try {
      return await api<T>(path, {
        ...input,
        orgId: orgId(),
        csrf: session()?.csrf,
      })
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setSession(undefined)
        setStatus("signed-out")
      }
      throw cause
    }
  }

  const switchOrg = async (id: string) => {
    if (id === orgId() || !session()) return
    setOrgId(id)
    localStorage.setItem(ORG_KEY, id)
    await reload()
  }

  const signOut = async () => {
    try {
      await request("/api/console/logout", { method: "POST" })
    } catch {
      // Signing out is best effort; the cookie is cleared server-side when it succeeds.
    }
    setSession(undefined)
    setStatus("signed-out")
    sessionStorage.clear()
  }

  onMount(() => {
    void reload()
  })

  const value: SessionApi = {
    session,
    user: () => session()?.user,
    org: () => session()?.org,
    status,
    error,
    orgId: () => orgId() ?? session()?.org.id,
    can: () => session()?.capabilities ?? emptyCapabilities,
    auth: () => session()?.auth,
    request,
    switchOrg,
    signOut,
    reload,
  }

  return <SessionContext.Provider value={value}>{props.children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error("useSession must be used inside SessionProvider")
  return context
}
