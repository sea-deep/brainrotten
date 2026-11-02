FROM node:26-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends g++ make cmake unzip xz-utils python3 libcurl4-openssl-dev autoconf automake libtool ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.9
RUN npm install --prefix /opt/runtime aws-lambda-ric@4.0.2
WORKDIR /var/task/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# Dependencies first, from manifests only, so source changes reuse the cached install layer.
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/media/package.json ./packages/media/package.json
COPY apps/companion/package.json ./apps/companion/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cloud/package.json ./apps/cloud/package.json
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps/cloud ./apps/cloud
RUN pnpm --filter @brainrot/contracts build && pnpm --filter @brainrot/media build && pnpm --filter @brainrot/cloud build

FROM node:26-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates libcurl4 && rm -rf /var/lib/apt/lists/*
WORKDIR /var/task/app
COPY --from=build /var/task/app /var/task/app
COPY --from=build /opt/runtime /opt/runtime
COPY apps/cloud/lambda-bootstrap.mjs /opt/runtime/bootstrap.mjs
COPY apps/web/public/fonts ./apps/web/public/fonts
COPY assets/gameplay ./assets/gameplay
# Character cutouts only (voice recordings and references stay out via .dockerignore).
COPY assets/characters ./assets/characters
ENV BRAINROTTEN_ROOT=/var/task/app BRAINROTTEN_MODE=hosted BRAINROT_SKIP_ENV=1 NPM_CONFIG_CACHE=/tmp/.npm
ENTRYPOINT ["/usr/local/bin/node", "/opt/runtime/bootstrap.mjs"]
CMD ["apps/cloud/dist/api.handler"]
