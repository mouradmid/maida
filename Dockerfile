# Image de production de Maïda : un seul conteneur qui sert l'API et le site.
#
# La disposition des dossiers est conservée telle quelle (apps/api, apps/web)
# parce que l'API sert le front par un chemin relatif : `apps/api/dist` cherche
# `../../web/dist`. Aplatir l'arborescence casserait le site sans casser l'API,
# c'est-à-dire de la pire des façons.

# ---------- Construction ----------
FROM node:22-bookworm-slim AS construction
WORKDIR /app

# Les manifestes d'abord : tant qu'ils ne changent pas, Docker réutilise
# l'installation des dépendances au lieu de la refaire à chaque commit.
COPY apps/api/package*.json apps/api/
COPY apps/web/package*.json apps/web/
RUN npm ci --prefix apps/api --include=dev \
    && npm ci --prefix apps/web --include=dev

COPY . .
RUN npm run build --prefix apps/web \
    && npm run build --prefix apps/api

# ---------- Dépendances d'exécution ----------
FROM node:22-bookworm-slim AS dependances
WORKDIR /app
COPY apps/api/package*.json apps/api/
RUN npm ci --prefix apps/api --omit=dev

# ---------- Image finale ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependances /app/apps/api/node_modules apps/api/node_modules
COPY --from=construction /app/apps/api/dist apps/api/dist
COPY --from=construction /app/apps/api/prisma apps/api/prisma
COPY --from=construction /app/apps/web/dist apps/web/dist
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/

# Le dossier de travail est celui de l'API : `prisma.config.ts` (qui donne
# l'URL de la base aux migrations) et les chemins du schéma sont relatifs à
# lui. Le site, lui, est retrouvé depuis `__dirname`, pas depuis le dossier
# courant — il reste donc servi correctement.
WORKDIR /app/apps/api

USER node
EXPOSE 3001

# `start:prod` applique les migrations AVANT d'ouvrir le port : une version
# déployée ne peut jamais tourner sur un schéma plus ancien qu'elle.
CMD ["npm", "run", "start:prod"]
