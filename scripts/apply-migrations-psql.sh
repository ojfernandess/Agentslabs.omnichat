#!/usr/bin/env bash
# Aplica supabase/migrations/*.sql em ordem usando psql (ligação directa ao Postgres do Supabase).
# Uso: DATABASE_URL="postgresql://postgres.[ref]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" ./scripts/apply-migrations-psql.sh
# Requer: postgresql-client (apt install postgresql-client)
set -euo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL (connection string do painel Supabase → Database)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
shopt -s nullglob
files=(supabase/migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "Nenhum ficheiro em supabase/migrations/"
  exit 1
fi
for f in "${files[@]}"; do
  echo ">>> $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "Migrações aplicadas."
