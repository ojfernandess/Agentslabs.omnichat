# Deployment containerizado

## Quick start (apenas frontend → Supabase Cloud)

```bash
cd ..   # raiz do repositório
docker compose build
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

Abra `http://localhost:${WEB_PORT:-8080}` e configure `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

(O ficheiro **`docker-compose.local.yml`** mapeia `8080→80` no host; o compose base não expõe portas — compatível com Easypanel.)

## Ficheiros

| Ficheiro | Uso |
|----------|-----|
| `Dockerfile` | Build multi-stage: Node → Nginx com SPA |
| `nginx.conf` | SPA fallback + gzip |
| `docker-compose.yml` (raiz) | Serviço `web` — padrão Easypanel (`expose` 80, sem `ports` no host) |
| `docker-compose.local.yml` (raiz) | Opcional: `ports` para testar em `localhost:8080` |
| `docker-compose.easypanel.yml` (raiz) | Igual à easypanel; `VITE_DEPLOYMENT_MODE` default `easypanel` |
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
5. Porta **interna** do container: **80** — no Easypanel use **Domains / Proxy** apontando para **80** (não é preciso `ports:` no compose; evita o aviso de conflito).

## Edge Functions self-hosted

As funções são **Deno** (`Deno.serve`). Opções:

1. **Recomendado:** Stack Supabase self-hosted oficial (inclui edge-runtime).
2. **Alternativa:** `supabase functions serve` em container (dev) ou deploy com CLI para o projeto linkado.
3. **URL separada:** definir `VITE_SUPABASE_FUNCTIONS_URL` no build do frontend.

Não há conversão automática para Node.js no repositório; o runtime oficial continua a ser Deno/Edge Runtime para compatibilidade com o código existente.
