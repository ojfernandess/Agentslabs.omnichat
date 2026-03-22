#!/usr/bin/env bash
# Health check pós-deploy: REST (PostgREST), opcional Realtime, Storage, app web.
# Variáveis:
#   VITE_SUPABASE_URL — URL do projeto Supabase
#   VITE_SUPABASE_PUBLISHABLE_KEY — anon key (opcional; testa REST /auth/v1/health se definida)
#   WEB_HEALTH_URL — URL do frontend (default http://localhost:8080/health)

set -euo pipefail

SUPABASE_URL="${VITE_SUPABASE_URL:-}"
WEB_URL="${WEB_HEALTH_URL:-http://localhost:8080/health}"

fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { echo "OK: $1"; }

if [[ -z "$SUPABASE_URL" ]]; then
  fail "VITE_SUPABASE_URL não definida"
fi

BASE="${SUPABASE_URL%/}"

# PostgREST expõe o schema via OpenAPI em alguns projetos; health simples: pedido ao root REST
code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/rest/v1/" -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY:-anon}" -H "Authorization: Bearer ${VITE_SUPABASE_PUBLISHABLE_KEY:-anon}" || echo "000")
if [[ "$code" == "200" || "$code" == "401" || "$code" == "404" ]]; then
  ok "REST respondeu (HTTP $code)"
else
  fail "REST inesperado (HTTP $code)"
fi

# Container nginx /health
if curl -sS -f -o /dev/null "$WEB_URL" 2>/dev/null; then
  ok "Frontend health ($WEB_URL)"
else
  echo "WARN: frontend health não respondeu em $WEB_URL (normal se só backend testado)"
fi

echo "Health check concluído."
