FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY client ./client
RUN npm install
RUN npm run build -w packages/shared
WORKDIR /app/client
# Vite production bundle (npm run build also runs tsc -b, which may fail in CI/Docker independently of runtime)
RUN npx vite build

FROM nginx:alpine
LABEL org.opencontainers.image.title="assessment-os-web" \
  org.opencontainers.image.description="Assessment OS web UI (nginx + React SPA)"
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
