# syntax=docker/dockerfile:1
# BackBet — imagem de produção (multi-stage)
#
# builder  ->  npm ci + tsc (gera dist/)
# runtime  ->  somente dependências de produção + dist + entrypoint

#####################################################################
# Stage 1 — base compartilhada
#####################################################################
FROM node:22-alpine AS base
WORKDIR /usr/src/app
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

#####################################################################
# Stage 2 — dependências (com devDependencies, necessárias ao build)
#####################################################################
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

#####################################################################
# Stage 3 — build (compila o TypeScript para dist/ e poda devDeps)
#####################################################################
FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
  && npm prune --omit=dev

#####################################################################
# Stage 4 — runtime (somente produção)
#####################################################################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV BACKBET_RUNTIME_ENV=production
ENV PORT=3000
WORKDIR /usr/src/app

# Usuário não-root e diretórios graváveis (logs + uploads)
RUN mkdir -p logs uploads \
  && chown -R node:node /usr/src/app

# Artefatos compilados e dependências de produção
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

USER node
EXPOSE 3000

# Healthcheck HTTP (fetch está disponível no Node 22)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]