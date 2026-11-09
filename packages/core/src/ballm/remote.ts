import { Duration, Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import type { Connection } from "@opencode/schema/connection"
import { ConfigIntegration } from "../config/integration.js"
import { Credential } from "../credential.js"
import { Integration } from "../integration.js"
import { headers, server } from "./access.js"
import { SignedOutError } from "./errors.js"

/** Fetches the connection's remote config, or undefined when the workspace has none. */
export function fetchRemote(http: HttpClient.HttpClient, credential: Credential.Key | Credential.OAuth) {
  return HttpClient.withScope(http)
    .execute(
      HttpClientRequest.get(`${server(credential)}/api/v2/config`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeaders(headers(credential)),
      ),
    )
    .pipe(
      Effect.flatMap((response) =>
        Effect.gen(function* () {
          if (response.status === 404) return undefined
          if (response.status === 401) return yield* new SignedOutError()
          const body = yield* HttpClientResponse.filterStatusOk(response).pipe(Effect.flatMap((ok) => ok.json))
          return yield* Schema.decodeUnknownEffect(ConfigIntegration.Remote)(body)
        }),
      ),
      Effect.scoped,
      Effect.timeout(Duration.seconds(10)),
    )
}

/** Wraps the remote config in the document the client applies as a connection-bound layer. */
export function makeDocument(input: {
  readonly connection: Connection.Info
  readonly organization: string | undefined
  readonly remote: ConfigIntegration.Remote
}) {
  return ConfigIntegration.make({
    integrationID: Integration.ID.make("ballm"),
    connection: input.connection,
    organization: input.organization,
    info: input.remote,
  })
}
