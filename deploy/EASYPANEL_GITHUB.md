# Easypanel + GitHub Actions (GHCR)

**Repositório:** [github.com/ojfernandess/Agentslabs.omnichat](https://github.com/ojfernandess/Agentslabs.omnichat) · branch `main`.

Este guia liga o workflow **`.github/workflows/docker-deploy.yml`** ao deploy no **Easypanel** com o mesmo stack que **`docker-compose.easypanel.yml`** (raiz do repo; espelho em `deploy/docker-compose.easypanel.yml`).

## 0. Easypanel — ficheiro Compose e Dockerfile (erro "open Dockerfile: no such file")

O Easypanel corre **sempre** (típico):

```text
docker compose -f .../code/docker-compose.yml -f .../code/docker-compose.override.yml up --build
```

Ou seja: o ficheiro **principal** é **`docker-compose.yml`** na pasta `code/` do projeto (clone do Git), **mais** um **`docker-compose.override.yml`** gerado pelo painel. **Não** é automático o uso de `docker-compose.easypanel.yml` nem de `deploy/docker-compose.easypanel.yml`, a menos que no projeto defina o nome do ficheiro Compose.

O repositório na **raiz** tem **`docker-compose.yml`** correto com:

- `build.context: .` (pasta do clone = raiz do repo, onde está o `Dockerfile`)
- `dockerfile: Dockerfile`

**Atualize o repositório** no Easypanel (pull / redeploy) para trazer este `docker-compose.yml` e o `Dockerfile` na raiz.

### Causa mais comum deste erro

O ficheiro **`deploy/docker-compose.easypanel.yml`** usa **`context: ..`** porque o compose está em `deploy/` (o pai é a raiz do repo). Se **copiar esse YAML para a raiz** como `docker-compose.yml` **sem mudar** `context`, fica `..` = **pasta acima do clone** → **não existe `Dockerfile`** (log pode mostrar `transferring dockerfile: 2B`).

**Correção:** use o `docker-compose.yml` **oficial na raiz do repo** (já com `context: .`), ou na raiz use **`docker-compose.easypanel.yml`** — **não** o ficheiro de `deploy/` colado na raiz sem ajustar paths.

### Se o erro continuar

1. No projeto Easypanel, confirme **nome do ficheiro Compose** (ex.: `docker-compose.yml` ou `docker-compose.easypanel.yml` **só na raiz do repo**).
2. Abra **`docker-compose.override.yml`**: se o serviço `web` **substituir** o `build` sem `dockerfile` ou com `context` errado, corrija no UI.
3. **Não** aponte o painel para `deploy/docker-compose.easypanel.yml` se o Easypanel não resolver `context: ..` em relação ao clone (prefira os ficheiros na **raiz**).

**No painel:** por defeito **`docker-compose.yml`** ou, se quiser default `VITE_DEPLOYMENT_MODE=easypanel`, **`docker-compose.easypanel.yml`** (ambos na raiz do repositório).

## 0b. Easypanel — variáveis para Docker Compose (erro "required variable is missing")

O Compose **não** usa mais `${VAR:?}` nos build args (isso falhava no Easypanel quando as variáveis não estavam disponíveis na interpolação).

1. No projeto Easypanel, abra **Environment** (ou equivalente) e crie pelo menos:
   - `VITE_SUPABASE_URL` — URL do projeto Supabase (`https://xxx.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — chave **anon** (publishable)
2. Nomes **idênticos** aos do ficheiro (maiúsculas e prefixo `VITE_`).
3. Referência de nomes: **`deploy/easypanel.env.example`**.

### Página em branco / “não mostra nada” após deploy

O Vite **embuti** estas variáveis **no momento do `docker build`** (`npm run build`). Se só existirem no runtime do container **depois** do build, o bundle continua **sem** URL/chave — o login não aparece ou vê-se o ecrã **Configuração do Supabase em falta** (a partir deste repositório).

- Garanta que o Easypanel passa `VITE_*` ao **build** do Compose (às vezes há opção “Build arguments” / variáveis disponíveis para **build** e não só **run**).
- Depois de definir ou corrigir variáveis: **rebuild** (não basta reiniciar o container).

Sem estes valores no build, o deploy conclui mas o SPA não liga ao Supabase.

## 0c. Aviso "ports is used in web" / conflito de portas

O **`docker-compose.yml`** na raiz **não** publica portas no host (`8080:80`); só **`expose`** para a rede Docker. O Easypanel encaminha o tráfego pelo **proxy interno** para a **porta do container**.

- No projeto → **Domains** (ou **Proxy**), defina o alvo como **porta interna 80 ou 8080** do serviço `web` (a imagem Nginx escuta em **ambas** — ver `docker/nginx.conf`).
- Se ainda vir o aviso, pode ser cache de um compose antigo: faça **pull** do repo e **redeploy**, ou remova `ports` de um `docker-compose.override.yml` manual no servidor.
- **Desenvolvimento local** com `localhost:8080`: use `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` (ver `docker-compose.local.yml`).

## 0d. Domínio não abre / 502 / timeout (container a correr, Nginx “ok” nos logs)

O Easypanel usa **Traefik** e pede a **porta do proxy** (porta em que a app **escuta** dentro do container). A [documentação](https://easypanel.io/docs/services/app) fala em “proxy port” (ex.: 3000, 8000).

- Se estiver **3000**, **8080** errado ou vazio, o proxy não encontra o Nginx → **502** ou **site não carrega**.
- **Correção no painel:** serviço **web** → **Domains & Proxy** → **Proxy port** / **Internal port** = **80** ou **8080** (o stack deste repo expõe **80 e 8080** no mesmo Nginx).
- Confirme que o **domínio** está associado ao serviço **web** (Compose), não a outro serviço.
- Teste rápido no servidor: `curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1/health` dentro da rede do stack (ou `docker exec` no container `web`).

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
2. Cole (ou monte por Git) o ficheiro **`docker-compose.easypanel.yml`** da raiz, mas **substitua o bloco `build`** por `image`:

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
- one-shot `db-init` com `docker compose -f docker-compose.easypanel.yml --profile migrate` e `DATABASE_URL` (ver comentários no compose).

## 6. Erro `relation "…" already exists` no `db push`

Significa que o **Postgres já tem as tabelas** (por exemplo criadas antes no Dashboard ou por outro fluxo), mas o **histórico de migrações** do Supabase ainda não tinha essa versão aplicada — o CI tentava criar `organizations` de novo.

**No repositório:** a migração inicial `20260321163200_*.sql` foi tornada **idempotente** (`CREATE TABLE IF NOT EXISTS`, políticas com `DROP POLICY IF EXISTS`, etc.), para o `supabase db push` poder correr mesmo quando o schema já existe.

**Se ainda falhar** (estado inconsistente), marque manualmente migrações como aplicadas (com o CLI linkado ao projeto):

```bash
supabase migration list
supabase migration repair --status applied 20260321163200
# repetir para outras versões já refletidas na base, se necessário
```

Ou use **Run workflow** com **skip_migrate** e aplique migrações só pelo Dashboard / CLI local.

## 7. Checklist rápido

- [ ] Secrets `VITE_*` preenchidos no GitHub (ou build args no Easypanel se build lá).
- [ ] Workflow verde em **Actions**.
- [ ] Pacote GHCR visível / credenciais de pull no Easypanel.
- [ ] URL da app em `VITE_PUBLIC_APP_URL` se o frontend precisar (OAuth, redirects).
