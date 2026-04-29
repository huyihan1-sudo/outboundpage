#!/usr/bin/env bash
set -euo pipefail

VERSION="${GOSOM_VERSION:-1.12.1}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/tools/gosom"
TARGET="$TARGET_DIR/google-maps-scraper"

mkdir -p "$TARGET_DIR"
curl -L \
  "https://github.com/gosom/google-maps-scraper/releases/download/v${VERSION}/google_maps_scraper-${VERSION}-linux-amd64" \
  -o "$TARGET"
chmod +x "$TARGET"
"$TARGET" -version

