#!/usr/bin/env bash
# Deploy para EasyPanel ou ambiente Docker genérico.
# Executa: validação de env, db-init (se DATABASE_URL definido), build e up do web.
#
# Uso:
#   ./scripts/deploy-easypanel.sh
#   ./scripts/deploy-easypanel.sh --skip-db-init   # apenas frontend
#   ./scripts/deploy-easypanel.sh --db-init-only   # apenas migrações
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SKIP_DB_INIT=false
DB_INIT_ONLY=false
for a in "$@"; do
  case "$a" in
    --skip-db-init)  SKIP_DB_INIT=true ;;
    --db-init-only)  DB_INIT_ONLY=true ;;
  esac
done

echo "[deploy-easypanel] Verificando variáveis de ambiente..."
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
missing=()
for v in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY; do
  [ -z "${!v:-}" ] && missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "[deploy-easypanel] ERRO: defina no .env: ${missing[*]}"
  exit 1
fi

if [ "$DB_INIT_ONLY" = true ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[deploy-easypanel] ERRO: DATABASE_URL necessário para db-init"
    exit 1
  fi
  echo "[deploy-easypanel] Aplicando migrações..."
  docker compose --profile init run --rm db-init
  echo "[deploy-easypanel] Migrações concluídas."
  exit 0
fi

if [ "$SKIP_DB_INIT" = false ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[deploy-easypanel] Aplicando migrações..."
  docker compose --profile init run --rm db-init || {
    echo "[deploy-easypanel] AVISO: db-init falhou. Verifique DATABASE_URL. Continuando..."
  }
fi

echo "[deploy-easypanel] Build e subida do serviço web..."
docker compose up -d --build web
echo "[deploy-easypanel] Pronto. Frontend em http://localhost:${WEB_PORT:-8080}"
echo ""
echo "Próximos passos:"
echo "  1. Deploy das Edge Functions: ./scripts/deploy-functions.sh"
echo "  2. Configurar Secrets no Supabase Dashboard: supabase/functions/secrets.env.example"
echo "  3. Configurar webhooks Meta/Evolution/Telegram conforme documentação"
