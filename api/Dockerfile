# Production image for the Carla Création website: NestJS API serving a
# built React frontend. Multi-stage: frontend and backend build in parallel,
# only their build output + runtime deps end up in the final image.

FROM node:20-alpine AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS api-build
# better-sqlite3 needs to compile a native addon on install.
RUN apk add --no-cache python3 make g++
WORKDIR /build/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app

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
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
