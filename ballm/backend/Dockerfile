# syntax=docker/dockerfile:1

FROM oven/bun:1.4.4 AS console
WORKDIR /console
COPY console/package.json console/bun.lock ./
RUN bun install --frozen-lockfile
COPY console ./
RUN bun run build

FROM oven/bun:1.4.4 AS deps

WORKDIR /app
COPY package.json bun.lock* tsconfig.json ./
COPY packages ./packages
COPY services ./services
COPY migrations ./migrations
COPY scripts ./scripts

RUN bun install --frozen-lockfile

FROM deps AS runtime
ARG SERVICE=control-plane
ENV BALLM_SERVICE=${SERVICE}
ENV BALLM_CONSOLE_DIR=/app/console/dist
ENV NODE_ENV=production

COPY --from=console /console/dist ./console/dist

# Coolify and other orchestrators probe /health with curl inside the container.
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

USER bun
EXPOSE 8787 8788

CMD ["sh", "-c", "exec bun run services/${BALLM_SERVICE}/src/index.ts"]
