# NOVIA Pilot (P2) : API + ordonnanceur + front pilote, une seule image, aucun secret dedans.
# Les secrets (DATABASE_URL, NOVIA_CRON_TOKEN) sont injectés à l'exécution comme variables secrètes du conteneur.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:pilot && npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 NOVIA_STATIC_DIR=/app/dist-pilot
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/dist-pilot ./dist-pilot
USER node
EXPOSE 8080
CMD ["node", "dist-server/main.js"]
