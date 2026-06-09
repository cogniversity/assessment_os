#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/.."

TAG="${IMAGE_TAG:-latest}"

echo "Building cogniverse/assessment-os-api:${TAG} ..."
docker build -f server/Dockerfile -t "cogniverse/assessment-os-api:${TAG}" -t "cogniverse/assessment-os-api:latest" .

echo "Building cogniverse/assessment-os-web:${TAG} ..."
docker build -f client/Dockerfile -t "cogniverse/assessment-os-web:${TAG}" -t "cogniverse/assessment-os-web:latest" .

echo "Done. Run: npm run docker:up"
