# Docker alternatīva systemd servisam (Fāze 12.1).
# Build:  docker build -f deploy/Dockerfile -t domino-poker .
# Run:    docker run -d --name domino-poker -p 4000:4000 --env-file .env \
#           -v "$(pwd)/data:/app/data" --restart unless-stopped domino-poker
#
# Node 24 (iebūvētais node:sqlite prasa ≥ 22.5). Vienkārša viena-stadijas būve MVP-am;
# vēlāk var optimizēt uz daudz-stadiju (atmest dev atkarības mazākam attēlam).

FROM node:24-slim

WORKDIR /app

# Vispirms manifesti — labāka Docker slāņu kešošana (npm ci nepārstartējas pie koda izmaiņām).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY tools/simulators/package.json tools/simulators/
COPY tools/load-test/package.json tools/load-test/

RUN npm ci

# Pārējais kods + būve. Konteiners palaiž TIKAI serveri, tāpēc būvējam tikai tā
# atkarību ķēdi (core → shared → server) pareizā secībā — NEvis pilno `npm run build`,
# kas lieki būvētu arī Next.js web / simulatorus / load-test (lēni, lielāks attēls,
# un web `next build` neveiksme citādi bloķētu servera attēlu).
COPY . .
RUN npm run build --workspace packages/core --workspace packages/shared --workspace apps/server

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "apps/server/dist/index.js"]
