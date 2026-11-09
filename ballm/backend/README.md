# Ballm control plane

Auth, directory, remote client config, and the OpenAI-compatible gateway for Ballm Code. See
[`../docs/02-backend-contract.md`](../docs/02-backend-contract.md) for the wire contract.

## Run

```sh
cp .env.example .env
bun install
bun run dev
```

Defaults: `http://localhost:8787`, SQLite at `./ballm.db`, synthetic completions (`BALLM_DEV_ECHO=1`).
Set `UPSTREAM_BASE_URL` (including `/v1`) and `UPSTREAM_API_KEY` to proxy a real upstream.

## Smoke test

```sh
bun run src/dev/seed.ts
curl -s http://localhost:8787/health
curl -s http://localhost:8787/v1/models -H "Authorization: Bearer <access>"
```

## Layout

| Path             | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `src/auth/`      | device flow, token validation, revocation            |
| `src/directory/` | `/api/user` and `/api/orgs`                          |
| `src/config/`    | `/api/v2/config` and the delivered policy statements |
| `src/gateway/`   | model list, token validation, proxy, dev echo, audit |
| `src/store/`     | SQLite schema and repository                         |
| `src/dev/`       | local helpers                                        |
| `test/`          | Bun tests against an in-memory database              |

## Production checklist

- Replace the device approval page with the corporate IdP.
- Set `BALLM_ALLOW_DEV_APPROVE=0`.
- Disable `BALLM_DEV_ECHO`.
- Put the service behind TLS and a private load balancer.
- Back up the SQLite file or move the store to the managed database.
- Add rate limiting to `/auth/device/*` and `/v1/*`.
- Ship audit rows to the central log pipeline.
