# Arquitetura de deployment (Supabase + Docker + Easypanel)

Este documento descreve como o **Agents Labs / Omni Chat** se integra com **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions) e como fazer deploy em **Docker**, **Easypanel** ou stacks sem alterar o código da aplicação — apenas variáveis de ambiente.

## Visão geral

| Camada | Tecnologia | Responsabilidade |
|--------|------------|------------------|
| Frontend | React + Vite (SPA servida por Nginx) | UI, chamadas a `REST`, `Auth`, `Storage`, `Functions` |
| Backend de dados | Supabase (PostgREST, GoTrue, Storage, Realtime) | API compatível com `@supabase/supabase-js` |
| Lógica serverless | Edge Functions (Deno, `supabase/functions`) | Webhooks, envio WhatsApp, media, etc. |

A aplicação **não** embute um servidor HTTP próprio (tipo Rails); o paralelo com **Chatwoot** é **frontend + API no mesmo domínio** através de um **reverse proxy** que encaminha:

- `/` → SPA
- `https://<projeto>.supabase.co/...` → continua a ser o host da API (modo cloud), **ou**
- mesmo host com Kong/Nginx a replicar os paths `/rest/v1`, `/auth/v1`, `/storage/v1`, `/functions/v1` (modo self-hosted Supabase).

## Modos de operação

### 1. Modo **Supabase Cloud** (recomendado para produção rápida)

- **Banco, Auth, Storage, Realtime e Edge Functions** ficam no projeto Supabase (`*.supabase.co`).
- **Docker** serve apenas o **frontend** (`Dockerfile` / `deploy/Dockerfile`).
- Migrações: `supabase db push` ou CI com `DATABASE_URL` do painel.

**Variáveis de build do frontend:**

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon_key>
# VITE_SUPABASE_FUNCTIONS_URL vazio → usa .../functions/v1 no mesmo host
```

### 2. Modo **Supabase self-hosted** (Docker oficial)

Use o repositório oficial [supabase/supabase](https://github.com/supabase/supabase/tree/master/docker) para subir Kong, GoTrue, PostgREST, Storage, Realtime, **Edge Runtime**, Postgres.

- Aponte `VITE_SUPABASE_URL` para a URL pública do **Kong** (ex.: `https://api.seudominio.com`).
- Use a **anon key** gerada no projeto self-hosted.
- Copie as pastas `supabase/functions` para o volume que o stack espera, ou faça deploy com `supabase functions deploy` contra o projeto linkado.

**Vantagem:** paridade máxima com Cloud; **Edge Functions** continuam Deno sem adaptador Node.

### 3. Modo **funções noutro host** (proxy / Easypanel)

Se o frontend estiver em `https://app.seudominio.com` mas as funções estiverem expostas em `https://api.seudominio.com/functions/v1`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://api.seudominio.com/functions/v1
```

O cliente Supabase (`src/integrations/supabase/client.ts`) redireciona pedidos a `/functions/v1` para essa base. Chamadas manuais usam `getFunctionUrl()` de `src/lib/runtimeEnv.ts`.

**Não é necessário alterar** páginas individuais além do que já está centralizado.

### 4. Armazenamento de mídia no **Easypanel (MinIO/S3)** com **Supabase Cloud** (DB + Auth)

Pode manter o projeto Supabase (`*.supabase.co`) para Postgres, Auth e Realtime, mas **guardar ficheiros** (imagens, áudio, vídeo, PDF, avatares de inbox) num **bucket S3-compatible** no servidor (ex.: **MinIO** no Easypanel), em vez do **Supabase Storage** do projeto na cloud.

**Passo a passo MinIO no Easypanel (domínio, buckets, secrets):** ver **[EASYPANEL_MINIO.md](./EASYPANEL_MINIO.md)**.

| Onde | O quê |
|------|--------|
| Frontend (build) | `VITE_EXTERNAL_MEDIA_STORAGE=true` — `uploadMessageAttachment` / `uploadInboxAvatar` chamam a Edge Function `upload-media` (multipart) em vez de `supabase.storage`. |
| Base URL do upload | `VITE_EXTERNAL_MEDIA_UPLOAD_URL` (opcional; ex.: `https://api.seudominio.com/functions/v1`) ou `VITE_SUPABASE_FUNCTIONS_URL` se as funções estiverem noutro host. |
| Edge `upload-media` | Secrets `S3_MEDIA_*` e `MEDIA_PUBLIC_BASE_URL` (ver `supabase/functions/secrets.env.example`). |
| Outras funções | Com os mesmos secrets, `process-media`, `evolution-whatsapp-webhook` e `meta-whatsapp-webhook` gravam áudio no S3 e devolvem URLs públicas `{MEDIA_PUBLIC_BASE_URL}/{bucket}/{key}`. |

**URLs públicas:** o bucket deve ser legível publicamente (ou atrás de CDN com o mesmo path) para o WhatsApp e o browser carregarem os ficheiros. O valor `MEDIA_PUBLIC_BASE_URL` é o prefixo **antes** do nome do bucket (ex.: `https://cdn.seudominio.com` → ficheiro `https://cdn.seudominio.com/message-media/org/...`).

**Secrets no Supabase Cloud:** mesmo que a Edge Function corra no Supabase, as funções precisam de credenciais S3 e endpoint acessível a partir da Cloud (MinIO exposto em HTTPS ou túnel). Alternativa: deploy das funções `upload-media`/`webhooks` num runtime que partilhe rede com o MinIO (Easypanel).

Código S3: referência em `supabase/functions/_shared/s3-media.ts`. **No deploy remoto** (`supabase functions deploy`) o bundle **não** inclui `../_shared` — a lógica está **inline** nos `index.ts` das funções que usam MinIO; alterações devem replicar-se nesses ficheiros.

## Migrações de base de dados

As migrações estão em `supabase/migrations/*.sql` e **assumem** schema `auth` (ex.: `auth.users`) e políticas RLS típicas do Supabase.

| Método | Quando usar |
|--------|-------------|
| `supabase db push` | Projeto linkado ao CLI |
| `scripts/apply-migrations-psql.sh` | Qualquer Postgres com `psql` |
| `scripts/db-migrate.sh` / `Dockerfile.db-init` | Container one-shot com `DATABASE_URL` |

**Atenção:** aplicar só o SQL em Postgres “puro” sem extensões e sem `auth` **falha**. Para ambiente mínimo, use sempre **Postgres do Supabase** (cloud ou imagem oficial do stack).

## Edge Functions: equivalência Supabase vs “local”

- O código em `supabase/functions/*/index.ts` é **Deno** (`Deno.serve`).
- **Não há** camada Node de substituição no repositório; a equivalência passa por:
  - **Mesmo runtime**: Edge Runtime do Supabase (cloud ou self-hosted), ou
  - **Proxy**: o mesmo path `/functions/v1/<nome>` com corpo e headers compatíveis.

Variáveis sensíveis (`SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_HOOK_SECRET`, etc.) devem ser configuradas no painel Supabase ou no `env` do serviço Edge Runtime.

## Escalabilidade (webhooks e campanhas)

Picos de mensagens, retries da Meta e campanhas em massa: ver **[SCALING_WEBHOOKS_AND_CAMPAIGNS.md](./SCALING_WEBHOOKS_AND_CAMPAIGNS.md)** (filas `webhook_ingest_jobs` / `campaign_send_jobs`, workers `process-webhook-ingest` e `campaign-worker`).

## Easypanel

1. **App 1 – Web:** Dockerfile `Dockerfile` ou `deploy/Dockerfile`, contexto na **raiz** do repositório.
2. **Build args:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, opcionalmente `VITE_SUPABASE_FUNCTIONS_URL`.
3. **App 2 (opcional) – Migrações:** imagem construída com `Dockerfile.db-init`, comando único, `DATABASE_URL` apontando ao Postgres do Supabase ou self-hosted.
4. **Porta:** mapear `8080` → HTTP do container.

Compose de referência: **`docker-compose.easypanel.yml`** (raiz; Easypanel) ou `deploy/docker-compose.easypanel.yml`.

## Monitoramento e logs

| Onde | O quê |
|------|--------|
| Supabase Dashboard → Logs | Edge Functions, API, Postgres |
| Easypanel | Logs do container `web`, restart policy |
| `scripts/health-check.sh` | REST + health do Nginx |

Em produção, configure alertas no provedor (Supabase / Easypanel / cloud) para taxas de erro 5xx nas funções e latência do Postgres.

## Testes automatizados

- `src/lib/runtimeEnv.test.ts` — URLs de funções com/sem `VITE_SUPABASE_FUNCTIONS_URL`.
- `npm test` — Vitest (env de teste define `VITE_SUPABASE_URL` em `vitest.config.ts`).

Smoke pós-deploy: `./scripts/health-check.sh` com `VITE_SUPABASE_URL` e `WEB_HEALTH_URL` definidos.

## Referências

- [Supabase Self-Hosting Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Self-Hosted Functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)
- `deploy/README.md` — quick start Docker só frontend
