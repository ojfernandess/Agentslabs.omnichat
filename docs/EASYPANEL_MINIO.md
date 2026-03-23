# MinIO no Easypanel (armazenamento S3 para mídia)

Este guia descreve como subir **MinIO** no **Easypanel** e ligar o frontend (build args) e as **Edge Functions** Supabase (`upload-media`, webhooks WhatsApp) ao armazenamento compatível com S3.

## Visão geral

| Componente | Função |
|--------------|--------|
| **MinIO (Easypanel)** | Guarda ficheiros (áudio, imagens, PDF) em buckets `message-media` e `inbox-avatars`. |
| **Supabase Cloud** | Postgres, Auth, Edge Functions — as funções **escrevem** no MinIO via API S3 (HTTPS). |
| **Frontend (Easypanel)** | Com `VITE_EXTERNAL_MEDIA_STORAGE=true`, uploads vão para a função `upload-media`, que grava no MinIO. |

**Requisito:** o endpoint S3 do MinIO (`S3_MEDIA_ENDPOINT`) tem de ser **alcançável pela Internet com HTTPS** a partir dos servidores da Supabase (Edge Functions). MinIO só na rede interna do VPS **não** funciona com Supabase Cloud até expor um URL público (domínio + TLS) ou túnel.

---

## 1. Criar o serviço MinIO no Easypanel

1. No Easypanel, **Create** → **App** (ou **Docker Compose**).
2. Use a imagem oficial **`minio/minio`** (tag estável, ex. `RELEASE.2024-xx` ou `latest` com cuidado).
3. **Comando / args** típicos do MinIO:
   - Comando: `server`
   - Args: `/data` (pasta de dados persistente).
4. **Variáveis de ambiente** (exemplos):
   - `MINIO_ROOT_USER` — utilizador admin (guarde em local seguro).
   - `MINIO_ROOT_PASSWORD` — palavra-passe forte.
   - Opcional: `MINIO_BROWSER=on` para consola web (porta consola).
5. **Volume**: monte um volume persistente em `/data` para não perder buckets ao reiniciar.
6. **Portas internas:**
   - **API S3:** normalmente **9000**.
   - **Consola web:** normalmente **9001** (se usar).

No **Domains / Proxy** do Easypanel:

- Atribua um domínio para a **API** (ex. `s3.seudominio.com` → porta interna **9000**).
- Opcional: outro domínio para a consola (ex. `minio.seudominio.com` → **9001**).
- Ative **HTTPS** (Let’s Encrypt) no painel.

Anote:

- URL base da API: `https://s3.seudominio.com` (sem barra final) — costuma ser o valor de **`S3_MEDIA_ENDPOINT`** com path-style ou virtual-host conforme configurares.

---

## 2. Criar os buckets e política pública de leitura

1. Abra a **consola MinIO** (porta 9001 ou URL que configurou).
2. Faça login com `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`.
3. Crie os buckets (nomes alinhados ao código):
   - **`message-media`**
   - **`inbox-avatars`**
4. Para o browser e o WhatsApp conseguirem **ler** ficheiros por URL pública:
   - Defina política de bucket **read-only** para `anon`/`public` nos objetos necessários, **ou**
   - Use um prefixo público atrás do mesmo domínio que usar em `MEDIA_PUBLIC_BASE_URL` (ver secção 4).

Se usar apenas URL assinada, o fluxo atual do projeto espera URLs **públicas** derivadas de `MEDIA_PUBLIC_BASE_URL` — veja `upload-media` e `DEPLOYMENT_ARCHITECTURE.md`.

---

## 3. Credenciais de acesso (S3)

No MinIO (consola → **Access Keys** ou utilizadores):

- Crie um **access key** e **secret** dedicados à aplicação (não precisa ser o root).
- Guarde:
  - **Access Key** → `S3_MEDIA_ACCESS_KEY`
  - **Secret Key** → `S3_MEDIA_SECRET_KEY`

**Região:** MinIO aceita qualquer string; o código usa por defeito `us-east-1` (`S3_MEDIA_REGION`).

**Path style:** para MinIO, mantenha **`S3_MEDIA_FORCE_PATH_STYLE=true`** (recomendado).

---

## 4. URL pública dos ficheiros (`MEDIA_PUBLIC_BASE_URL`)

As funções montam URLs do tipo:

`{MEDIA_PUBLIC_BASE_URL}/{bucket}/{key}`

Exemplo:

- `MEDIA_PUBLIC_BASE_URL=https://cdn.seudominio.com`
- Ficheiro: `https://cdn.seudominio.com/message-media/org/.../ficheiro.ogg`

Pode ser:

- O **mesmo host** da API S3 com path-style, **ou**
- Um **subdomínio** / CDN que faça proxy para o bucket.

Tem de ser **HTTPS** acessível pelos clientes (browser, WhatsApp).

---

## 5. Secrets nas Edge Functions (Supabase)

No **Supabase Dashboard** → **Edge Functions** → **Secrets**, defina (nomes iguais ao código):

| Secret | Exemplo |
|--------|---------|
| `S3_MEDIA_ENDPOINT` | `https://s3.seudominio.com` |
| `S3_MEDIA_REGION` | `us-east-1` |
| `S3_MEDIA_ACCESS_KEY` | (access key MinIO) |
| `S3_MEDIA_SECRET_KEY` | (secret key MinIO) |
| `S3_MEDIA_FORCE_PATH_STYLE` | `true` |
| `S3_MEDIA_BUCKET_MESSAGE` | `message-media` |
| `S3_MEDIA_BUCKET_INBOX` | `inbox-avatars` |
| `MEDIA_PUBLIC_BASE_URL` | `https://cdn.seudominio.com` (sem `/` no fim) |

Referência completa: `supabase/functions/secrets.env.example`.

Redeploy das funções que usam S3 (`upload-media`, `meta-whatsapp-webhook`, `evolution-whatsapp-webhook`, `process-media`) após alterar secrets.

---

## 6. Frontend no Easypanel (build args)

No projeto Docker Compose do frontend:

- `VITE_EXTERNAL_MEDIA_STORAGE=true`
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (projeto Supabase).
- Opcional: `VITE_EXTERNAL_MEDIA_UPLOAD_URL` se a base das funções não for a predefinida (`https://xxx.supabase.co/functions/v1`).

**Rebuild** da imagem após alterar `VITE_*`.

---

## 7. Checklist rápido

- [ ] MinIO a correr com volume persistente e HTTPS no domínio da API.
- [ ] Buckets `message-media` e `inbox-avatars` criados.
- [ ] Leitura pública (ou equivalente) para URLs servidas ao browser/WhatsApp.
- [ ] Secrets `S3_MEDIA_*` e `MEDIA_PUBLIC_BASE_URL` no Supabase.
- [ ] `VITE_EXTERNAL_MEDIA_STORAGE=true` no **build** do frontend.
- [ ] Teste: upload de anexo na app → objeto aparece no MinIO; URL abre no browser.

---

## Ver também

- `docs/DEPLOYMENT_ARCHITECTURE.md` — secção mídia externa + Supabase Cloud.
- `docs/BUCKET_MESSAGE_MEDIA.md` — bucket no **Supabase Storage** (modo sem MinIO).
