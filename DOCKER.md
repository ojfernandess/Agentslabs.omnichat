# Docker e deploy

## Arquitectura

- **Imagem `web`**: build estático do Vite (React) servido por **Nginx**. Variáveis `VITE_*` são **embutidas no build** — não alteram em runtime.
- **Base de dados / Auth / Storage**: **Supabase** (cloud ou self-hosted). Esta imagem **não** inclui Postgres nem o stack completo do Supabase.
- **Migrações SQL** em `supabase/migrations/` aplicam-se ao projeto Supabase com `supabase db push --include-all` (CI ou `npm run db:migrate`).

## Build local

```bash
cp .env.example .env
# Preencher VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (e opcionais)

docker compose up -d --build
# http://localhost:8080  (ou WEB_PORT no .env)
```

Healthcheck: `GET /health` → `ok`.

## GitHub Actions (`docker-deploy.yml`)

No push para `main` (ou execução manual):

1. **Migrações**: `supabase link` + `supabase db push --include-all` contra o projeto remoto.
2. **Docker**: build e push para `ghcr.io/<owner>/<repo>:latest` e tag `:sha-<commit>`.

### Secrets obrigatórios

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_ACCESS_TOKEN` | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID |
| `VITE_SUPABASE_URL` | URL do projeto (ex.: `https://xxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon / public key |

### Opcionais

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_DB_PASSWORD` | Database password (se o CLI pedir ao `link`) |
| `META_APP_ID`, `VITE_PUBLIC_APP_URL`, `VITE_INTERNAL_HOOK_SECRET` | Opcionais — ver workflow |

### Imagem no servidor

```bash
docker pull ghcr.io/SEU_USER/SEU_REPO:latest
docker run -d -p 8080:80 ghcr.io/SEU_USER/SEU_REPO:latest
```

(As variáveis Supabase já estão dentro do bundle; para mudar URL, rebuild com novos secrets e nova imagem.)

## Migrações sem CLI (fallback)

Com **connection string** do Postgres (Supabase → Database → URI):

```bash
export DATABASE_URL="postgresql://..."
bash scripts/apply-migrations-psql.sh
```

Requer `psql` (ex.: `postgresql-client` no Ubuntu).

## Stack Supabase completo local

Para API + Auth + Studio localmente, use a [CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase start
```

Isso levanta Docker próprio do Supabase; é independente da imagem `web` deste repositório.
