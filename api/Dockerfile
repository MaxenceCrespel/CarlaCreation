# Production image for the Carla Création website: NestJS API serving a
# built React frontend. Multi-stage: frontend and backend build in parallel,
# only their build output + runtime deps end up in the final image.

FROM node:22-alpine AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS api-build
WORKDIR /build/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
RUN npm run build
# Strip devDependencies (jest, ts-jest, supertest, @nestjs/testing, type
# packages...) from node_modules now that the build is done — none of that
# test tooling belongs in the shipped image, it only widens the scanned
# surface for no runtime benefit. ts-node/typescript stay (they're runtime
# `dependencies`, needed for the migration/seed CLI scripts below).
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app

# pg_dump, for `npm run backup` (scripts/backup.ts) to work via
# `docker compose exec web npm run backup` — not needed by the app itself
# at request-serving time, only by that one manual/cron script.
RUN apk add --no-cache postgresql-client

# The npm version bundled with the base image lags behind and vendors its
# own (occasionally vulnerable) copies of tar/glob/minimatch/cross-spawn/
# sigstore — irrelevant to our app code, but still part of the image Trivy
# scans, and `npm run <script>` (migrations/seed) does invoke this npm at
# container runtime. Upgrading it here keeps that surface current without
# waiting on a base image rebuild.
RUN npm install -g npm@latest

COPY --from=api-build /build/api/node_modules ./node_modules
COPY --from=api-build /build/api/dist ./dist
COPY --from=api-build /build/api/scripts ./scripts
COPY --from=api-build /build/api/src ./src
COPY --from=api-build /build/api/tsconfig.json ./tsconfig.json
COPY --from=api-build /build/api/package.json ./package.json
COPY --from=client-build /build/client/dist /client/dist

RUN mkdir -p data uploads \
  && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app /client
USER app

ENV NODE_ENV=production
ENV TZ=Europe/Paris
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
