# syntax=docker/dockerfile:1
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
ENV NODE_ENV=production

USER bun
EXPOSE 8787 8788

CMD ["sh", "-c", "exec bun run services/${BALLM_SERVICE}/src/index.ts"]
