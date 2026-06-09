FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY server ./server
RUN npm install
RUN npm run build -w packages/shared
WORKDIR /app/server
RUN npx prisma generate
RUN npx esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/index.js --packages=external

FROM node:22-alpine
LABEL org.opencontainers.image.title="assessment-os-api" \
  org.opencontainers.image.description="Assessment OS API (Express + Prisma)"
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/packages ./packages
COPY client/public/assessment_os_logo.png ./client/public/assessment_os_logo.png
COPY server/docker-entrypoint.sh /app/server/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/server/docker-entrypoint.sh && chmod +x /app/server/docker-entrypoint.sh
WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3001
ENTRYPOINT ["/app/server/docker-entrypoint.sh"]
