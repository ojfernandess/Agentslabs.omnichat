#!/usr/bin/env bash
# Aplica todas as migrações SQL (requer psql e DATABASE_URL).
# Uso: export DATABASE_URL="postgresql://..." && ./scripts/db-migrate.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MIG_DIR="$ROOT/supabase/migrations"
exec bash "$ROOT/docker/entrypoint-db-init.sh"
