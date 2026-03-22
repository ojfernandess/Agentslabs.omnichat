# Easypanel + GitHub Actions (GHCR)

Este guia liga o workflow **`.github/workflows/docker-deploy.yml`** ao deploy no **Easypanel** com o mesmo stack que `deploy/docker-compose.easypanel.yml`.

## 1. Secrets no GitHub

**Repositório → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `VITE_SUPABASE_URL` | Sim | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | anon key do projeto |
| `VITE_SUPABASE_FUNCTIONS_URL` | Não | Se as funções estiverem noutro host (ex. proxy no Easypanel) |
| `VITE_DEPLOYMENT_MODE` | Não | Ex.: `easypanel` (só informativo no bundle) |
| `META_APP_ID` | Não | Meta / WhatsApp |
| `VITE_PUBLIC_APP_URL` | Não | URL pública da app (ex. `https://app.seudominio.com`) |
| `VITE_INTERNAL_HOOK_SECRET` | Não | Segredo interno hooks |
| `VITE_EXTERNAL_MEDIA_STORAGE` | Não | `true` se mídia for para MinIO/S3 |
| `VITE_EXTERNAL_MEDIA_UPLOAD_URL` | Não | Base só para `upload-media` |

**Migrações automáticas no CI** (job `migrate`):

| Secret | Obrigatório se usar migrate |
|--------|-----------------------------|
| `SUPABASE_ACCESS_TOKEN` | Sim |
| `SUPABASE_PROJECT_REF` | Sim |
| `SUPABASE_DB_PASSWORD` | Opcional (se o `supabase link` pedir) |

Para **só gerar imagem** sem `db push`, use **Actions → Docker (GHCR) e migrações Supabase → Run workflow** e marque **skip_migrate**.

## 2. Imagem gerada

Após um push em `main` (ou run manual), a imagem fica em:

```text
ghcr.io/<seu-usuario-ou-org>/<nome-do-repo>:latest
ghcr.io/<seu-usuario-ou-org>/<nome-do-repo>:<sha-do-commit>
```

**Package visibility:** no GitHub → **Packages** → pacote `ghcr.io/...` → **Package settings** → se o repositório for privado, pode ser preciso tornar o pacote acessível ou usar um **PAT** no Easypanel para `docker pull`.

## 3. Easypanel — opção A: Compose com imagem pré-buildada

1. Crie um projeto no Easypanel e um serviço **Docker Compose**.
2. Cole (ou monte por Git) o ficheiro `deploy/docker-compose.easypanel.yml`, mas **substitua o bloco `build`** por `image`:

```yaml
services:
  web:
    image: ghcr.io/SEU_ORG/SEU_REPO:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

3. **Não** são necessárias variáveis de *build* no Easypanel — já vêm **embutidas** na imagem feita no GitHub Actions.
4. Mapeie o domínio e a porta (ex. 8080 → HTTPS).

## 4. Easypanel — opção B: Build a partir do Git

1. **Source:** repositório GitHub ligado.
2. **Dockerfile path:** `Dockerfile` (raiz do repo — o mesmo usado no workflow).
3. **Context:** raiz (`.`).
4. **Build arguments:** os mesmos nomes que no `Dockerfile` / compose (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, etc.).  
   Duplica a configuração dos secrets do GitHub no Easypanel **ou** use apenas a opção A (GHCR) para um único lugar de verdade (CI).

## 5. Migrações sem CI

Se não usar o job `migrate`, aplique SQL com:

- Supabase Dashboard → SQL, ou  
- `supabase db push` local, ou  
- one-shot `db-init` com `docker compose -f deploy/docker-compose.easypanel.yml --profile migrate` e `DATABASE_URL` (ver comentários no compose).

## 6. Checklist rápido

- [ ] Secrets `VITE_*` preenchidos no GitHub (ou build args no Easypanel se build lá).
- [ ] Workflow verde em **Actions**.
- [ ] Pacote GHCR visível / credenciais de pull no Easypanel.
- [ ] URL da app em `VITE_PUBLIC_APP_URL` se o frontend precisar (OAuth, redirects).
