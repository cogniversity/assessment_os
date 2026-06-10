FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY client ./client
RUN npm install
RUN npm run build -w packages/shared
WORKDIR /app/client
ARG VITE_CONTEXT_ROOT=
ENV VITE_CONTEXT_ROOT=$VITE_CONTEXT_ROOT
# Vite production bundle (npm run build also runs tsc -b, which may fail in CI/Docker independently of runtime)
RUN npx vite build

FROM nginx:alpine
LABEL org.opencontainers.image.title="assessment-os-web" \
  org.opencontainers.image.description="Assessment OS web UI (nginx + React SPA)"
RUN apk add --no-cache gettext
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx-root.conf /etc/nginx/templates/root.conf
COPY client/nginx-context-root.conf.template /etc/nginx/templates/context-root.conf.template
COPY client/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENV CONTEXT_ROOT=
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
