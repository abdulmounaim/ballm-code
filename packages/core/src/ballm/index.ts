import { Duration, Effect, Semaphore, Scope } from "effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { define } from "@opencode/plugin/effect/plugin"
import { HttpClient, HttpClientRequest } from "effect/http"
import type { Connection } from "@opencode/schema/connection"
import { Bus } from "../bus.js"
import { ConfigIntegration } from "../config/integration.js"
import { ConfigProviderPlugin } from "../config/plugin/provider.js"
import { Credential } from "../credential.js"
import { IntegrationConnection } from "../integration/connection.js"
import { ProviderRefresh } from "../plugin/provider/refresh.js"
import { oauth } from "./oauth.js"
import { product } from "./product.js"
import { fetchRemote, makeDocument } from "./remote.js"
import { SignedOutError } from "./errors.js"

type ActiveConnection = Effect.Success<ReturnType<Context["integration"]["connection"]["active"]>>

interface Snapshot {
  readonly remote: ConfigIntegration.Remote | undefined
  readonly connection: ActiveConnection
  readonly organization: string | undefined
  readonly document: ConfigIntegration.Document | undefined
}

const empty = (connection: ActiveConnection): Snapshot => ({
  remote: undefined,
  connection,
  organization: undefined,
  document: undefined,
})

/**
 * Registers the Ballm integration, its device login, and the connection-bound provider.
 *
 * The provider does not come from a local config file. It is built from the backend's remote config
 * and bound to the active credential, so signing out removes it and managed policy has nothing local
 * to override.
 */
export const BallmPlugin = define<HttpClient.HttpClient | Bus.Service | Scope.Scope>({
  id: "ballm.provider",
  effect: Effect.fn(function* (ctx) {
    const client = yield* HttpClient.HttpClient
    const http = HttpClient.mapRequest(client, HttpClientRequest.setHeader("User-Agent", product.userAgent))
    const loading = Semaphore.makeUnsafe(1)
    let snapshot: Snapshot = empty(undefined)

    const report = (connection: ActiveConnection, status: IntegrationConnection.Status | undefined) =>
      connection
        ? ctx.integration.connection.status({
            integrationID: product.integrationID,
            connection,
            status,
          })
        : Effect.void

    const load = Effect.fn("Ballm.load")(function* () {
      const connection = yield* ctx.integration.connection.active(product.integrationID)
      if (!connection) return empty(undefined)
      const credential = yield* ctx.integration.connection
        .resolve(connection)
        .pipe(Effect.orElseSucceed(() => undefined))
      if (!credential || credential.type === "external") return empty(connection)
      const organization = organizationName(credential)
      return yield* fetchRemote(http, credential).pipe(
        Effect.map(
          (remote): Snapshot => ({
            remote,
            connection,
            organization,
            document: remote
              ? makeDocument({ connection: brandedConnection(connection), organization, remote })
              : undefined,
          }),
        ),
        Effect.catchIf(
          (error): error is SignedOutError => error instanceof SignedOutError,
          () =>
            report(connection, { status: "needs_auth", message: "Reconnect Ballm to continue" }).pipe(
              Effect.as(empty(connection)),
            ),
        ),
        // A transient failure keeps the last known config; the periodic poll retries.
        Effect.catch((error) => Effect.logWarning("ballm config load failed", { error }).pipe(Effect.as(undefined))),
      )
    })

    const publish = Effect.fn("Ballm.publish")(function* (next: Snapshot | undefined) {
      if (!next) return
      const changed =
        JSON.stringify(next.remote) !== JSON.stringify(snapshot.remote) ||
        IntegrationConnection.key(next.connection) !== IntegrationConnection.key(snapshot.connection)
      snapshot = next
      if (changed) yield* ctx.provider.reload()
    })

    const refresh = Effect.fn("Ballm.refresh")(function* () {
      yield* loading.withPermit(publish(yield* load()))
    })

    yield* ctx.integration.transform((editor) => {
      editor.update(product.integrationID, (integration) => {
        integration.name = product.name
      })
      editor.method.update(oauth(http))
    })

    yield* ctx.provider.transform((providers) => {
      if (snapshot.document) ConfigProviderPlugin.integrate(providers, snapshot.document)
    })

    yield* publish(yield* load())

    yield* ProviderRefresh.onSwitch(product.integrationID, refresh())
    yield* Effect.sleep(Duration.minutes(5)).pipe(Effect.andThen(refresh()), Effect.forever, Effect.forkScoped)
  }),
})

function organizationName(value: Credential.Value) {
  const name = value.metadata?.[product.orgNameMetadataKey]
  return typeof name === "string" ? name : undefined
}

/** The plugin API exposes client connection shapes; the config document stores branded IDs. */
function brandedConnection(connection: NonNullable<ActiveConnection>): Connection.Info {
  return connection.type === "credential" ? { ...connection, id: Credential.ID.make(connection.id) } : connection
}
