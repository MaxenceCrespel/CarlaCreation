# Production image for the Carla Création website. Single-stage: this app
# ships no build step (plain JS/EJS), so there's nothing to compile away.
FROM node:20-alpine

# better-sqlite3 needs to compile a native addon on install.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/ ./
COPY frontend/ ../frontend/

# Writable at runtime for the SQLite file and uploaded photos; mount these
# as volumes in production so data survives container recreation.
RUN mkdir -p data uploads \
  && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app /app/../frontend
USER app

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
