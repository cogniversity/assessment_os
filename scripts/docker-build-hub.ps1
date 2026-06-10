# Build cogniverse/* images for docker-compose.yml
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }

Write-Host "Building cogniverse/assessment-os-api:${tag} ..."
docker build -f server/Dockerfile -t "cogniverse/assessment-os-api:${tag}" -t "cogniverse/assessment-os-api:latest" .

$contextRoot = if ($env:CONTEXT_ROOT) { $env:CONTEXT_ROOT } else { "" }

Write-Host "Building cogniverse/assessment-os-web:${tag} (VITE_CONTEXT_ROOT=$contextRoot) ..."
docker build -f client/Dockerfile --build-arg "VITE_CONTEXT_ROOT=$contextRoot" -t "cogniverse/assessment-os-web:${tag}" -t "cogniverse/assessment-os-web:latest" .

Write-Host "Done. Run: npm run docker:up"
