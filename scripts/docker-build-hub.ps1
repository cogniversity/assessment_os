# Build cogniverse/* images for docker-compose.yml
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }

Write-Host "Building cogniverse/assessment-os-api:${tag} ..."
docker build -f server/Dockerfile -t "cogniverse/assessment-os-api:${tag}" -t "cogniverse/assessment-os-api:latest" .

Write-Host "Building cogniverse/assessment-os-web:${tag} ..."
docker build -f client/Dockerfile -t "cogniverse/assessment-os-web:${tag}" -t "cogniverse/assessment-os-web:latest" .

Write-Host "Done. Run: npm run docker:up"
