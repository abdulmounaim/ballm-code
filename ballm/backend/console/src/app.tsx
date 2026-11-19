import { A, Route, Router } from "@solidjs/router"
import { ErrorBoundary, Show, type JSX } from "solid-js"
import { Shell, AccessDenied } from "./components/shell"
import { Logo } from "./components/controls"
import { Button } from "./components/button"
import { Icon } from "./components/icon"
import { useSession } from "./session"
import { AccountPage } from "./routes/account"
import { AuditPage } from "./routes/audit"
import { AuthFlowPage } from "./routes/auth-flow"
import { DeviceApproval, DeviceSuccess } from "./routes/device"
import { IdentityPage } from "./routes/identity"
import { InvitePage } from "./routes/invite"
import { MembersPage } from "./routes/members"
import { ModelsPage } from "./routes/models"
import { OverviewPage } from "./routes/overview"
import { PoliciesPage } from "./routes/policies"
import { SessionsPage } from "./routes/sessions"
import { SignIn } from "./routes/sign-in"
import { UpstreamPage } from "./routes/upstream"
import { UsagePage } from "./routes/usage"
import { NewWorkspacePage } from "./routes/workspaces"
import type { Capabilities } from "./types"

export function App() {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <FatalError
          message={error instanceof Error ? error.message : "The console hit an unexpected error."}
          onRetry={() => window.location.reload()}
        />
      )}
    >
      <Router base="/console">
        <Route
          path="/login"
          component={() => (
            <AuthFlowPage
              kind="login"
              title="Sign in"
              description="Enter the email and password for your Ballm Code account."
              footer="login"
            />
          )}
        />
        <Route
          path="/register"
          component={() => (
            <AuthFlowPage
              kind="registration"
              title="Create your account"
              description="A personal workspace is created for you. You can join or create a team afterwards."
              footer="registration"
            />
          )}
        />
        <Route
          path="/recover"
          component={() => (
            <AuthFlowPage
              kind="recovery"
              title="Reset your password"
              description="We will email you a link to choose a new password."
              footer="recovery"
            />
          )}
        />
        <Route
          path="/verify"
          component={() => (
            <AuthFlowPage
              kind="verification"
              title="Verify your email"
              description="Confirm your address before using the workspace. We only need this once per address."
              footer="verification"
            />
          )}
        />
        <Route
          path="/settings"
          component={() => (
            <AuthFlowPage
              kind="settings"
              title="Password and security"
              description="Change your password or add a passkey. These controls belong to your account, not a workspace."
            />
          )}
        />
        <Route path="/invite" component={InvitePage} />
        <Route path="/device" component={DeviceApprovalRoute} />
        <Route path="/device/success" component={DeviceSuccessRoute} />
        <Route path="/" component={ProtectedShell}>
          <Route path="/" component={Home} />
          <Route
            path="/members"
            component={() => (
              <Require cap="manageMembers">
                <MembersPage />
              </Require>
            )}
          />
          <Route
            path="/models"
            component={() => (
              <Require cap="manageModels">
                <ModelsPage />
              </Require>
            )}
          />
          <Route
            path="/policies"
            component={() => (
              <Require cap="managePolicies">
                <PoliciesPage />
              </Require>
            )}
          />
          <Route
            path="/identity"
            component={() => (
              <Require cap="manageSso">
                <IdentityPage />
              </Require>
            )}
          />
          <Route
            path="/upstream"
            component={() => (
              <Require cap="manageUpstream">
                <UpstreamPage />
              </Require>
            )}
          />
          <Route
            path="/sessions"
            component={() => (
              <Require cap="manageMembers">
                <SessionsPage />
              </Require>
            )}
          />
          <Route
            path="/usage"
            component={() => (
              <Require cap="viewUsage">
                <UsagePage />
              </Require>
            )}
          />
          <Route
            path="/audit"
            component={() => (
              <Require cap="viewAudit">
                <AuditPage />
              </Require>
            )}
          />
          <Route path="/account" component={AccountPage} />
          <Route path="/workspaces/new" component={NewWorkspacePage} />
          <Route path="*" component={NotFound} />
        </Route>
      </Router>
    </ErrorBoundary>
  )
}

function DeviceApprovalRoute() {
  const code = new URLSearchParams(window.location.search).get("user_code") ?? ""
  return <DeviceApproval initialCode={code} />
}

function DeviceSuccessRoute() {
  const code = new URLSearchParams(window.location.search).get("user_code") ?? undefined
  return <DeviceSuccess code={code} />
}

function ProtectedShell(props: { children?: JSX.Element }) {
  const session = useSession()

  return (
    <>
      <Show when={session.status() === "loading"}>
        <BootSplash />
      </Show>
      <Show when={session.status() === "signed-out"}>
        <SignIn />
      </Show>
      <Show when={session.status() === "error"}>
        <FatalError message={session.error()} onRetry={() => void session.reload()} />
      </Show>
      <Show when={session.status() === "ready"}>
        <Shell>{props.children}</Shell>
      </Show>
    </>
  )
}

function Home() {
  const session = useSession()
  return (
    <Show when={session.session()?.role === "member"} fallback={<OverviewPage />}>
      <AccountPage />
    </Show>
  )
}

function Require(props: { cap: keyof Capabilities; children: JSX.Element }) {
  const session = useSession()
  return (
    <Show when={session.can()[props.cap]} fallback={<AccessDenied />}>
      {props.children}
    </Show>
  )
}

function BootSplash() {
  return (
    <div class="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading the console">
      <div class="flex flex-col items-center gap-4">
        <Logo />
        <span class="size-5 animate-spin-slow rounded-full border-2 border-accent border-r-transparent" aria-hidden="true" />
      </div>
    </div>
  )
}

function FatalError(props: { message?: string; onRetry: () => void }) {
  return (
    <main class="grid min-h-dvh place-items-center px-6">
      <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card">
        <span class="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
          <Icon name="alert" class="size-5" />
        </span>
        <h1 class="mt-4 text-[18px] font-semibold text-ink">The console could not start</h1>
        <p class="mt-1 text-[13px] leading-6 text-ink-muted">
          {props.message ?? "The control plane did not answer. Check that it is running and reachable."}
        </p>
        <div class="mt-5 flex gap-2">
          <Button variant="primary" onClick={props.onRetry}>
            <Icon name="refresh" class="size-4" /> Try again
          </Button>
          <Button variant="ghost" onClick={() => window.location.assign("/console/")}>
            Reload
          </Button>
        </div>
      </div>
    </main>
  )
}

function NotFound() {
  return (
    <div class="mx-auto max-w-md py-16 text-center">
      <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-subtle">404</p>
      <h1 class="mt-2 text-[20px] font-semibold text-ink">Page not found</h1>
      <p class="mt-1 text-[13px] text-ink-muted">That console page does not exist.</p>
      <A
        href="/"
        class="mt-5 inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition hover:bg-surface-hover"
      >
        Back to overview
      </A>
    </div>
  )
}
