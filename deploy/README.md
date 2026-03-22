# Deployment containerizado

## Quick start (apenas frontend → Supabase Cloud)

```bash
cd ..
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

Abra `http://localhost:${WEB_PORT:-8080}` e configure `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Ficheiros

| Ficheiro | Uso |
|----------|-----|
| `Dockerfile` | Build multi-stage: Node → Nginx com SPA |
| `nginx.conf` | SPA fallback + gzip |
| `docker-compose.yml` | Serviço `web` |
| `docker-compose.selfhosted.yml` | Exemplo com variáveis para backend self-hosted |
| `k8s/web-deployment.yaml` | Deployment + Service + Ingress opcional |

## Migrações (CI/CD)

```bash
# Com Supabase CLI linkado ao projeto
./scripts/deploy-migrate.sh

# Ou manualmente
export DATABASE_URL="postgresql://..."
psql "$DATABASE_URL" -f supabase/migrations/...
```

## Health check pós-deploy

```bash
./scripts/health-check.sh
./scripts/integration-smoke.sh
```

## Easypanel

- **Compose Easypanel (recomendado):** `docker-compose.easypanel.yml` na **raiz** do repo — `docker compose -f docker-compose.easypanel.yml --env-file .env up -d --build`.
- Alternativa: `deploy/docker-compose.easypanel.yml` (usa `context: ..`; no Easypanel prefira o ficheiro na raiz).
- **GitHub Actions → imagem no GHCR:** ver **[EASYPANEL_GITHUB.md](./EASYPANEL_GITHUB.md)** (secrets, `skip_migrate`, uso de `ghcr.io/.../...:latest` no painel).

Build direto no Easypanel (sem GHCR):

1. Aplicação **Docker** / Compose a partir do repositório.
2. **Dockerfile path:** `Dockerfile` na **raiz** (o workflow CI usa o mesmo ficheiro).
3. **Build context:** raiz (`.`).
4. **Build args:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e opcionais (ver `.env.example` e `Dockerfile`).
5. Porta do container: **80** (mapeie para 8080/HTTPS no proxy do Easypanel).

## Edge Functions self-hosted

As funções são **Deno** (`Deno.serve`). Opções:

1. **Recomendado:** Stack Supabase self-hosted oficial (inclui edge-runtime).
2. **Alternativa:** `supabase functions serve` em container (dev) ou deploy com CLI para o projeto linkado.
3. **URL separada:** definir `VITE_SUPABASE_FUNCTIONS_URL` no build do frontend.

Não há conversão automática para Node.js no repositório; o runtime oficial continua a ser Deno/Edge Runtime para compatibilidade com o código existente.
