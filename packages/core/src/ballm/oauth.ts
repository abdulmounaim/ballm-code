import { Duration, Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import type { IntegrationOAuthMethodRegistration } from "@opencode/plugin/effect/integration"
import { Credential } from "../credential.js"
import { Integration } from "../integration.js"
import { normalizeServer, server } from "./access.js"
import { SignedOutError } from "./errors.js"
import { product } from "./product.js"
import { Device, DeviceToken, InvalidGrant, Org, Token, User } from "./schemas.js"

const methodID = Integration.MethodID.make(product.methodID)

export function oauth(http: HttpClient.HttpClient) {
  return {
    integrationID: product.integrationID,
    method: {
      id: methodID,
      type: "oauth",
      label: `${product.name} account`,
      form: [
        {
          key: "server",
          type: "string",
          format: "uri",
          hidden: true,
          default: product.defaultServer,
        },
      ],
    },
    authorize: (answer) =>
      Effect.gen(function* () {
        const target = yield* normalizeServer(answer.server ?? product.defaultServer)
        const device = yield* post(
          http,
          `${target}/auth/device/code`,
          { client_id: product.clientID, supports_org_scope: true },
          Device,
        )
        const verification = yield* Effect.try({
          try: () => {
            const url = new URL(device.verification_uri_complete, `${target}/`)
            if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("expected HTTP(S)")
            return url
          },
          catch: (cause) =>
            new Error(`Invalid device verification URL: ${cause instanceof Error ? cause.message : String(cause)}`),
        })
        return {
          mode: "auto" as const,
          url: verification.href,
          instructions: `Enter code: ${device.user_code}`,
          callback: poll(http, target, device.device_code, Duration.seconds(device.interval)),
        }
      }),
    refresh: (credential) =>
      Effect.gen(function* () {
        const response = yield* send(http, `${server(credential)}/auth/device/token`, {
          grant_type: "refresh_token",
          refresh_token: credential.refresh,
          client_id: product.clientID,
        })
        if (response.status === 400) {
          const body = yield* HttpClientResponse.schemaBodyJson(InvalidGrant)(response).pipe(Effect.option)
          if (Option.isSome(body)) return yield* new SignedOutError()
        }
        const token = yield* HttpClientResponse.filterStatusOk(response).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Token)),
        )
        return {
          ...credential,
          access: token.access_token,
          refresh: token.refresh_token,
          expires: Date.now() + token.expires_in * 1000,
          metadata:
            token.org_id == null
              ? credential.metadata
              : {
                  ...credential.metadata,
                  [product.orgMetadataKey]: token.org_id,
                  [product.orgNameMetadataKey]:
                    credential.metadata?.[product.orgMetadataKey] === token.org_id &&
                    typeof credential.metadata?.[product.orgNameMetadataKey] === "string"
                      ? credential.metadata[product.orgNameMetadataKey]
                      : token.org_id,
                },
        }
      }),
    label: (credential) =>
      typeof credential.metadata?.[product.orgNameMetadataKey] === "string"
        ? (credential.metadata[product.orgNameMetadataKey] as string)
        : undefined,
  } satisfies IntegrationOAuthMethodRegistration
}

function poll(http: HttpClient.HttpClient, target: string, deviceCode: string, interval: Duration.Duration) {
  const loop = (wait: Duration.Duration): Effect.Effect<Credential.OAuth, unknown> =>
    Effect.gen(function* () {
      yield* Effect.sleep(wait)
      const result = yield* post(
        http,
        `${target}/auth/device/token`,
        {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: product.clientID,
        },
        DeviceToken,
        false,
      )
      if ("access_token" in result) return yield* credential(http, target, result)
      if (result.error === "authorization_pending") return yield* loop(wait)
      if (result.error === "slow_down") return yield* loop(Duration.sum(wait, Duration.seconds(5)))
      return yield* Effect.fail(new Error(`Device authorization failed: ${result.error}`))
    })
  return loop(interval)
}

function credential(http: HttpClient.HttpClient, target: string, token: typeof Token.Type) {
  return Effect.gen(function* () {
    const [user, orgs] = yield* Effect.all(
      [
        get(http, `${target}/api/user`, token.access_token, User),
        get(http, `${target}/api/orgs`, token.access_token, Schema.Array(Org)),
      ],
      { concurrency: 2 },
    )
    const org =
      token.org_id == null
        ? orgs.toSorted((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0]
        : orgs.find((item) => item.id === token.org_id)
    if (token.org_id != null && !org) {
      return yield* Effect.fail(new Error(`Ballm organization not found: ${token.org_id}`))
    }
    return Credential.OAuth.make({
      type: "oauth" as const,
      methodID,
      access: token.access_token,
      refresh: token.refresh_token,
      expires: Date.now() + token.expires_in * 1000,
      metadata: {
        [product.serverMetadataKey]: target,
        [product.accountMetadataKey]: user.id,
        [product.emailMetadataKey]: user.email,
        [product.orgMetadataKey]: org?.id,
        [product.orgNameMetadataKey]: org?.name,
      },
    })
  })
}

function get<S extends Schema.Top>(http: HttpClient.HttpClient, url: string, token: string, schema: S) {
  return HttpClient.filterStatusOk(http)
    .execute(HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bearerToken(token)))
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)))
}

function post<S extends Schema.Top>(
  http: HttpClient.HttpClient,
  url: string,
  body: Record<string, string | boolean>,
  schema: S,
  statusOk = true,
) {
  return send(http, url, body).pipe(
    Effect.flatMap((response) => (statusOk ? HttpClientResponse.filterStatusOk(response) : Effect.succeed(response))),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
  )
}

function send(http: HttpClient.HttpClient, url: string, body: Record<string, string | boolean>) {
  return HttpClientRequest.post(url).pipe(
    HttpClientRequest.acceptJson,
    HttpClientRequest.schemaBodyJson(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean])))(body),
    Effect.flatMap((request) => http.execute(request)),
  )
}
