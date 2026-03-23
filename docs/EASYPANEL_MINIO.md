# MinIO no Easypanel (armazenamento S3 para mídia)

Este guia descreve como subir **MinIO** no **Easypanel** e conectar o frontend (build args) e as **Edge Functions** do Supabase (`upload-media`, webhooks do WhatsApp) ao armazenamento compatível com S3.

## Visão geral

| Componente | Função |
|------------|--------|
| **MinIO (Easypanel)** | Armazena arquivos (áudio, imagens, PDF) nos buckets `message-media` e `inbox-avatars`. |
| **Supabase Cloud** | Postgres, Auth, Edge Functions — as funções **gravam** no MinIO via API S3 (HTTPS). |
| **Frontend (Easypanel)** | Com `VITE_EXTERNAL_MEDIA_STORAGE=true`, os uploads vão para a função `upload-media`, que grava no MinIO. |

**Requisito:** o endpoint S3 do MinIO (`S3_MEDIA_ENDPOINT`) precisa ser **acessível pela internet com HTTPS** a partir dos servidores do Supabase (Edge Functions). MinIO só na rede interna do VPS **não** funciona com o Supabase Cloud até você expor uma URL pública (domínio + TLS) ou um túnel.

---

## 1. Criar o serviço MinIO no Easypanel

1. No Easypanel, **Create** → **App** (ou **Docker Compose**).
2. Use a imagem oficial **`minio/minio`** (tag estável, ex.: `RELEASE.2024-xx` ou `latest` com cuidado).
3. **Comando / args** típicos do MinIO:
   - Comando: `server`
   - Args: `/data` (pasta de dados persistente).
4. **Variáveis de ambiente** (exemplos):
   - `MINIO_ROOT_USER` — usuário admin (guarde em local seguro).
   - `MINIO_ROOT_PASSWORD` — senha forte.
   - Opcional: `MINIO_BROWSER=on` para o console web (porta do console).
5. **Volume:** monte um volume persistente em `/data` para não perder buckets ao reiniciar.
6. **Portas internas:**
   - **API S3:** normalmente **9000**.
   - **Console web:** normalmente **9001** (se usar).

No **Domains / Proxy** do Easypanel:

- Atribua um domínio para a **API** (ex.: `s3.seudominio.com` → porta interna **9000**).
- Opcional: outro domínio para o console (ex.: `minio.seudominio.com` → **9001**).
- Ative **HTTPS** (Let’s Encrypt) no painel.

Anote:

- URL base da API: `https://s3.seudominio.com` (sem barra no final) — costuma ser o valor de **`S3_MEDIA_ENDPOINT`**, com path-style ou virtual-host conforme você configurar.

---

## 2. Criar os buckets e política pública de leitura

### Opção A — Console web (porta 9001)

1. Abra o **console MinIO** (URL com proxy para a porta **9001**; não confunda com a API **9000**).
2. Faça login com `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`.
3. **Buckets** → **Create bucket** → `message-media` e `inbox-avatars`.
4. Política pública (leitura): no bucket → **Access** / **Anonymous** / **Summary** (varia conforme a versão) → permitir leitura pública **ou** use a **Opção B** abaixo.

Se o console **não mostrar** “Access Keys”, “Service Accounts” ou políticas, é normal em alguns proxies/versões — vá às seções **3** e **2b**.

### 2c. Só aparece “Object Browser” e buckets em **PRIVATE** (sem Identity / Access Keys)

Se o menu lateral **não** mostrar **Administrator**, **Identity**, **Access Keys**, etc., e só **Object Browser** + lista de buckets:

| Causa provável | O que fazer |
|----------------|-------------|
| **Sessão sem privilégios de admin** | Você provavelmente está autenticado como usuário **IAM** com política só de objetos (ex.: `s3:*` em um bucket), não como **root**. Faça **Sign Out** e entre com **`MINIO_ROOT_USER`** e **`MINIO_ROOT_PASSWORD`** (os mesmos do ambiente do container). |
| **Credenciais root alteradas no Easypanel, mas volume antigo** | O MinIO grava o root na **primeira** inicialização em `/data`. Mudar variáveis depois **não** altera o login. Use as credenciais **originais** ou apague o volume e recrie (perde dados). |
| **Domínio do console apontando para a porta errada** | O **console** deve ir para a porta interna **9001**; a **API S3** para **9000**. Se o proxy estiver errado, pode aparecer interface incompleta ou erros. |
| **Política de bucket** | “PRIVATE” no resumo do bucket é **esperado** até aplicar leitura anônima (`mc anonymous set download …`) ou política; não depende de ver o menu Identity. |

**Não é obrigatório** ter o menu “Access Keys” para o projeto Omni Chat: nas Edge Functions você pode usar **as credenciais root** como `S3_MEDIA_ACCESS_KEY` / `S3_MEDIA_SECRET_KEY` (veja a seção **3**). Para **política pública de leitura**, use a **Opção B** (`mc`) — não depende do console administrativo.

### Opção B — Linha de comando (`mc`, MinIO Client) — recomendado se a UI falhar

Não precisa instalar nada no PC: use um container efêmero com a imagem `minio/mc`.

Substitua `https://API_SEU_MINIO` pela URL **HTTPS da API S3** (porta **9000** no proxy, ex.: `https://s3.agentslabs.cloud`), e as credenciais **root** ou outras chaves S3 válidas.

Use a URL **da API** (`https://…` que aponta para a porta **9000**), não só o hostname do console, no `alias set`. Exemplo em um único container (o alias não persiste entre `docker run` separados):

```bash
docker run --rm minio/mc sh -c '
  mc alias set local https://API_SEU_MINIO ROOT_USER ROOT_PASSWORD &&
  mc mb -p local/message-media || true &&
  mc mb -p local/inbox-avatars || true &&
  mc anonymous set download local/message-media &&
  mc anonymous set download local/inbox-avatars &&
  mc anonymous get local/message-media
'
```

No Windows (PowerShell), prefira rodar os comandos **dentro** do **Console** do Easypanel no serviço MinIO, ou use Git Bash / WSL para o `sh -c` acima.

No **Easypanel**, alternativa: **Console** no serviço MinIO → shell dentro do container → se existir `mc` na imagem, ou baixe o binário `mc` conforme a documentação do MinIO.

**Verificar:** `docker run --rm minio/mc anonymous get local/message-media` deve mostrar `download` ou `public`.

### Política JSON manual (se preferir arquivo)

Com `mc`, você pode aplicar política customizada a um bucket (ex.: só `GetObject` para `*`):

```bash
# Criar policy.json e depois:
# mc anonymous set-json /path/policy.json local/message-media
```

Ou no console: **Bucket** → **Access Rules** → editar JSON (depende da versão). O fluxo mais simples continua sendo `mc anonymous set download` nos dois buckets.

---

## 3. Credenciais de acesso (S3)

### Se **não** conseguir criar Access Key / Service Account no console

O projeto aceita **as mesmas credenciais do usuário root** nas Edge Functions (API compatível com S3):

| Secret Supabase | Valor |
|-----------------|--------|
| `S3_MEDIA_ACCESS_KEY` | = valor de `MINIO_ROOT_USER` |
| `S3_MEDIA_SECRET_KEY` | = valor de `MINIO_ROOT_PASSWORD` |

**Nota de segurança:** o root tem permissões totais. Para produção, o ideal é criar um usuário limitado — mas isso exige console funcionando ou `mc admin user` + políticas. Enquanto a UI não ajudar, **root nas secrets** é o caminho mais direto (não commite senhas no Git).

### Se o console permitir Identity / Service Accounts (versões recentes)

1. **Identity** → **Service Accounts** → **Create** (ou **Users** + políticas).
2. Guarde **Access Key** e **Secret** → `S3_MEDIA_ACCESS_KEY` / `S3_MEDIA_SECRET_KEY`.

### Via CLI (`mc` admin)

```bash
docker run --rm -it minio/mc admin user svcacct add local ROOT_USER --access-key "app-media" --secret-key "SEGREDO_LONGO"
```

(A sintaxe exata pode variar; use `mc admin user svcacct add --help` no container `minio/mc`.)

**Região:** o MinIO aceita qualquer string; o código usa por padrão `us-east-1` (`S3_MEDIA_REGION`).

**Path style:** para MinIO, mantenha **`S3_MEDIA_FORCE_PATH_STYLE=true`** (recomendado).

---

## 4. URL pública dos arquivos (`MEDIA_PUBLIC_BASE_URL`)

As funções montam URLs no formato:

`{MEDIA_PUBLIC_BASE_URL}/{bucket}/{key}`

Exemplo:

- `MEDIA_PUBLIC_BASE_URL=https://cdn.seudominio.com`
- Arquivo: `https://cdn.seudominio.com/message-media/org/.../arquivo.ogg`

Pode ser:

- O **mesmo host** da API S3 com path-style, **ou**
- Um **subdomínio** / CDN que faça proxy para o bucket.

Precisa ser **HTTPS** acessível pelos clientes (navegador, WhatsApp).

---

## 5. Secrets nas Edge Functions (Supabase)

No **Supabase Dashboard** → **Edge Functions** → **Secrets**, defina (nomes iguais ao código):

| Secret | Exemplo |
|--------|---------|
| `S3_MEDIA_ENDPOINT` | `https://s3.seudominio.com` |
| `S3_MEDIA_REGION` | `us-east-1` |
| `S3_MEDIA_ACCESS_KEY` | (access key do MinIO) |
| `S3_MEDIA_SECRET_KEY` | (secret key do MinIO) |
| `S3_MEDIA_FORCE_PATH_STYLE` | `true` |
| `S3_MEDIA_BUCKET_MESSAGE` | `message-media` |
| `S3_MEDIA_BUCKET_INBOX` | `inbox-avatars` |
| `MEDIA_PUBLIC_BASE_URL` | `https://cdn.seudominio.com` (sem `/` no final) |

Referência completa: `supabase/functions/secrets.env.example`.

Faça **novo deploy** das funções que usam S3 (`upload-media`, `meta-whatsapp-webhook`, `evolution-whatsapp-webhook`, `process-media`) depois de alterar os secrets.

---

## 6. Frontend no Easypanel (build args)

No projeto Docker Compose do frontend:

- `VITE_EXTERNAL_MEDIA_STORAGE=true`
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (projeto Supabase).
- Opcional: `VITE_EXTERNAL_MEDIA_UPLOAD_URL` se a base das funções não for a padrão (`https://xxx.supabase.co/functions/v1`).

**Rebuild** da imagem depois de alterar `VITE_*`.

---

## 7. Checklist rápido

- [ ] MinIO em execução com volume persistente e HTTPS no domínio da API.
- [ ] Buckets `message-media` e `inbox-avatars` criados.
- [ ] Leitura pública (ou equivalente) para URLs servidas ao navegador/WhatsApp.
- [ ] Secrets `S3_MEDIA_*` e `MEDIA_PUBLIC_BASE_URL` no Supabase.
- [ ] `VITE_EXTERNAL_MEDIA_STORAGE=true` no **build** do frontend.
- [ ] Teste: upload de anexo no app → objeto aparece no MinIO; URL abre no navegador.

---

## Ver também

- `docs/DEPLOYMENT_ARCHITECTURE.md` — seção de mídia externa + Supabase Cloud.
- `docs/BUCKET_MESSAGE_MEDIA.md` — bucket no **Supabase Storage** (modo sem MinIO).
