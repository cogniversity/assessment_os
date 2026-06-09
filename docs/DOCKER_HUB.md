# Docker Hub

Images: **`cogniverse/assessment-os-api`** and **`cogniverse/assessment-os-web`**.

## Run

```bash
cp compose.env.example compose.env
# edit compose.env
npm run docker:up
```

Compose reads variables from **`compose.env`** via `--env-file`. Stack definition is **`docker-compose.yml`**.

Optional production: `cp docker-compose.override.example.yml docker-compose.override.yml`

After first start, set `RUN_DB_SEED=false` in `compose.env`. Fresh database: `npm run docker:reset`.

## Build locally

```bash
npm run docker:build
npm run docker:up
```

## Publish (CI)

GitHub secret **`DOCKERHUB_TOKEN`** for **cogniverse**. Tag `v1.0.0` triggers `.github/workflows/docker-publish.yml`.
