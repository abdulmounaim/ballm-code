# Console

The Ballm Code console is the human interface to the control plane. It replaces ad-hoc `curl`
against the admin API for day-to-day operations while keeping the admin token for automation.

It is a SolidJS single-page app served by the control plane at `/console/`.

## Screens

| Route | Who | Purpose |
| --- | --- | --- |
| `/console/` | owners, admins | Organization overview, 14-day traffic, readiness checks, recent activity |
| `/console/members` | owners, admins | Invite people, change roles, revoke pending invitations, remove access |
| `/console/models` | owners, admins | Catalog and per-organization allowlist |
| `/console/policies` | owners, admins | Delivered policy statements and defaults |
| `/console/identity` | owners, admins | OIDC connection, allowed domains, group-to-role mapping |
| `/console/upstream` | owners, admins | Model upstream, encrypted API key, connection test |
| `/console/sessions` | owners, admins | Active devices, revoke access |
| `/console/usage` | owners, admins | Requests and tokens by day, model, and developer |
| `/console/audit` | owners, admins | Append-only administrative and authentication history |
| `/console/account` | everyone | Profile, role, sign-in method, connected devices, sign out |
| `/console/workspaces/new` | everyone | Create a team workspace |
| `/console/login` | public | Kratos password/passkey flow |
| `/console/register` | public | Self-serve account and personal workspace |
| `/console/recover` | public | Password recovery |
| `/console/verify` | public | Email verification |
| `/console/settings` | signed in | Password and passkey settings |
| `/console/invite` | public | Accept a workspace invitation |
| `/console/device` | public / signed in | Approve a device code from the CLI or desktop app |
| `/console/device/success` | public | Confirmation after approval |

Members land on their account page. Navigation and routes are filtered by capability, and the
server independently enforces the same rules.

## Stack

- **SolidJS** for fine-grained reactivity without a virtual DOM.
- **Vite** for the build, with content-hashed assets.
- **Tailwind CSS 4** with a small semantic token layer (`canvas`, `surface`, `line`, `ink`, `accent`,
  `success`, `warning`, `danger`, `info`).
- **Kobalte** for the accessible dialog primitive; everything else is purpose-built.
- **Self-hosted Inter and JetBrains Mono** so the console makes no third-party requests.
- No chart library. The usage chart is SVG driven by the real usage rows.

## Authentication

1. The sign-in screen asks for a work email.
2. `POST /api/console/sign-in` resolves the organization by allowed email domain and starts OIDC
   authorization code + PKCE.
3. The callback creates the browser session cookie and redirects to `/console/`.
4. `GET /api/console/session` returns the user, memberships, selected organization, role, CSRF token,
   and capabilities.

The organization is chosen with the `X-Org-Id` header. The server always re-reads the membership and
role from Postgres, so a role change or removal applies on the next request. Console reads use the
primary, not a read replica, so an edit is visible immediately after it is saved.

## Security model

| Control | Implementation |
| --- | --- |
| Session | `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, `__Host-` prefix on HTTPS, 8-hour default lifetime |
| CSRF | HMAC token bound to the browser session id, returned by `/api/console/session`, required on every mutation |
| Origin | `Origin` must match the canonical public origin or the request's own host; `Sec-Fetch-Site` must be same-origin |
| Authorization | Server-side owner/admin/member checks on every route; owners cannot be removed or demoted while last |
| Secrets | SSO client secrets and upstream keys are AES-256-GCM sealed, write-only in the UI, and never returned |
| XSS | Solid escapes text by default; no `innerHTML`; strict CSP with no inline scripts |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| Transport | HSTS when the public URL is HTTPS; TLS terminates at the ingress |
| Caching | Console API responses are `no-store`; the shell is `no-cache`; hashed assets are immutable |
| Rate limits | Sign-in, device start/approve, discovery, and upstream tests are rate limited |
| Audit | Every mutation writes `console.*` to `audit_events` with the acting user |

Content Security Policy for the shell:

```text
default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline';
img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self';
frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
```

`style-src-attr` is required for dynamic chart positions and avatar colors. It does not permit
stylesheets or scripts.

The browser never stores the CSRF token in `localStorage`. Only the selected organization id and the
theme preference are persisted; both are non-sensitive.

## Accessibility and UX

- Semantic landmarks, a skip link, and visible focus rings.
- Every input has a label; icon-only buttons have `aria-label` and tooltips.
- Tables have captions and column headers; badge tone is never the only signal.
- Dialogs trap focus, close on Escape, and restore focus.
- Destructive actions require confirmation and name their consequence.
- Loading uses skeletons; empty, error, and partial states are explicit.
- Light, dark, and system themes; no flash because tokens are defined in CSS.
- `prefers-reduced-motion` removes animation.
- Layout adapts from a 390 px phone to a wide desktop; the sidebar becomes a drawer.
- `Ctrl/Cmd+K` opens a command menu for navigation and account actions.

## API surface

The console uses `/api/console/*`; it never uses `BALLM_ADMIN_TOKEN`.

```text
GET    /api/console/session
POST   /api/console/logout
GET    /api/console/overview
GET    /api/console/me
DELETE /api/console/me/sessions/:id
GET    /api/console/members
POST   /api/console/members
PATCH  /api/console/members/:userId
DELETE /api/console/members/:userId
GET    /api/console/invites
POST   /api/console/invites
DELETE /api/console/invites/:id
POST   /api/console/orgs
GET    /api/console/models
PUT    /api/console/models/:id
PUT    /api/console/models
GET    /api/console/policies
PUT    /api/console/policies
GET    /api/console/sso
PUT    /api/console/sso
POST   /api/console/sso/test
GET    /api/console/upstream
PUT    /api/console/upstream
POST   /api/console/upstream/test
GET    /api/console/sessions
DELETE /api/console/sessions/:id
GET    /api/console/usage
GET    /api/console/audit
POST   /api/console/sign-in
GET    /api/console/device
POST   /api/console/device/start
POST   /api/console/device/approve
```

Mutations require `X-Ballm-Csrf`. Errors use `{ "error": "code", "message": "..." }`.

## Development

```sh
cd ballm/backend
bun install
bun run --cwd console install
bun run --cwd console dev      # http://127.0.0.1:3001/console/
```

Vite proxies `/api` and `/auth` to `http://127.0.0.1:8787`, so the browser sees one origin and the
CSRF/origin checks behave the same as production.

For the built console served by the control plane:

```sh
bun run --cwd console build
bun run dev:control
# http://localhost:8787/console/
```

The Docker image builds `console/` in its own stage and copies `console/dist` to
`/app/console/dist`. `BALLM_CONSOLE_DIR` overrides that location.

## Verification

```sh
cd ballm/backend/console
bun run typecheck
bun test
bun run build
```

Backend integration tests cover cookie auth, CSRF and cross-session token rejection, origin checks,
RBAC, last-owner protection, secret redaction, model and policy updates, upstream probing, session
revocation, device approval, and static file serving.

## Extending

- Add a route in `src/routes/`, then register it under the shell in `src/app.tsx`.
- Add a nav item in `src/components/shell.tsx` with the capability that gates it.
- Add a backend route in `services/control-plane/src/routes/console.ts`; always call `requireRole`.
- Reuse `Card`, `PageHeader`, `Field`, `Modal`, `ConfirmDialog`, and `useToast`.
- Keep new colors semantic. Add a token to `src/styles.css` rather than hard-coding a hex value.
