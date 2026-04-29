#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production. Copy .env.production.example and edit it first."
  exit 1
fi

docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
