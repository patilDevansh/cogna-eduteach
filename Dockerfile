# One build stage, two runtime targets:
#   docker build --target api -t cogna-api .
#   docker build --target web --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t cogna-web .
# The web app imports apps/api source directly (media paths, OpenAI/TTS services), so both targets share one build.
# ponytail: devDependencies stay in the image (simple, larger). Use `pnpm deploy --prod` per app if image size matters.
FROM node:22-slim AS build
RUN corepack enable && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cogna/database generate \
 && pnpm --filter @cogna/shared build \
 && pnpm --filter @cogna/database build \
 && pnpm --filter @cogna/lesson-video build \
 && pnpm --filter @cogna/api build

FROM build AS api
ENV NODE_ENV=production COGNA_ENV=production COGNA_TRUST_PROXY=true
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@cogna/api", "start"]

FROM build AS web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @cogna/web build
ENV NODE_ENV=production COGNA_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@cogna/web", "start"]
