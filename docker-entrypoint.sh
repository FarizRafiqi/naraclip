#!/bin/sh
set -e

echo "=== [NaraClip] Checking / Running Database Migrations ==="
node ace.js migration:run --force || echo "Warning: Migration check completed with warnings."

echo "=== [NaraClip] Starting Production Server on port ${PORT:-3333} ==="
exec node bin/server.js
