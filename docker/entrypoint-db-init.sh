#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL é obrigatório (postgresql://user:pass@host:5432/db)"
  exit 1
fi

echo "Aplicando migrações em ordem lexicográfica em: $DATABASE_URL"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIG_DIR="${MIG_DIR:-$REPO_ROOT/supabase/migrations}"

if [ ! -d "$MIG_DIR" ]; then
  echo "Diretório de migrações não encontrado: $MIG_DIR"
  exit 1
fi

export PGOPTIONS="${PGOPTIONS:--c search_path=public}"

for f in $(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | sort); do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Migrações concluídas."
