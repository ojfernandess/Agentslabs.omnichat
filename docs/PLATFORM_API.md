# Platform API (compatível Chatwoot)

API para provisionar organizações, utilizadores e associações via token de Platform App. Inspirada nas [Chatwoot Platform APIs](https://github.com/chatwoot/chatwoot/wiki/Building-on-Top-of-Chatwoot:-Platform-APIs).

## Como obter o token

1. Aceda ao **Console Super Admin** → **Platform Apps**
2. Crie uma nova Platform App (ex: "n8n", "Zapier")
3. Copie o `access_token` exibido no momento da criação (não será mostrado novamente)

## Autenticação

Use o header `api_access_token` em todas as requisições:

```
api_access_token: sbp_xxxx...
```

Alternativa: `Authorization: Bearer sbp_xxxx...`

## Base URL

```
https://SEU_PROJETO.supabase.co/functions/v1/platform-api
```

## Endpoints

### 1. Criar Account (organização)

**POST** `/platform/api/v1/accounts`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| name | string | sim | Nome da organização |
| domain | string | não | Slug único (default: derivado do name) |
| locale | string | não | Locale (default: pt) |
| support_email | string | não | Email de suporte |
| custom_attributes | object | não | Atributos custom |

**Exemplo:**

```bash
curl -X POST "https://xxx.supabase.co/functions/v1/platform-api/platform/api/v1/accounts" \
  -H "api_access_token: sbp_xxxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "Minha Empresa", "locale": "pt"}'
```

**Resposta (200):**

```json
{
  "id": "uuid-da-organizacao",
  "name": "Minha Empresa",
  "slug": "minha-empresa",
  "status": "active",
  "created_at": "2024-..."
}
```

---

### 2. Criar User

**POST** `/platform/api/v1/users`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| email | string | sim | Email do utilizador |
| password | string | sim | Mín. 8 caracteres |
| name | string | não | Nome completo |
| display_name | string | não | Nome de exibição |
| custom_attributes | object | não | Atributos custom |

**Exemplo:**

```bash
curl -X POST "https://xxx.supabase.co/functions/v1/platform-api/platform/api/v1/users" \
  -H "api_access_token: sbp_xxxx" \
  -H "Content-Type: application/json" \
  -d '{"email": "agente@exemplo.com", "password": "Senha123!", "name": "João Silva"}'
```

**Resposta (200):**

```json
{
  "id": "uuid-do-user",
  "uid": "uuid-do-user",
  "name": "João Silva",
  "display_name": "João Silva",
  "email": "agente@exemplo.com",
  "accounts": [],
  "created_at": "2024-..."
}
```

---

### 3. Associar User à Account

**POST** `/platform/api/v1/accounts/{account_id}/account_users`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| user_id | string (UUID) | sim | ID do utilizador (auth.users) |
| role | string | sim | `administrator` ou `agent` |

Mapeamento de roles:
- `administrator` → admin
- `agent` → agent

**Exemplo:**

```bash
curl -X POST "https://xxx.supabase.co/functions/v1/platform-api/platform/api/v1/accounts/ORG_UUID/account_users" \
  -H "api_access_token: sbp_xxxx" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "USER_UUID", "role": "administrator"}'
```

**Resposta (200):**

```json
{
  "account_id": "uuid-org",
  "user_id": "uuid-user",
  "role": "admin"
}
```

---

## Fluxo recomendado (sincronização de auth)

1. **Criar Account** – obter `id` da organização
2. **Criar User** – obter `id` do utilizador
3. **Criar Account User** – associar o user à account com role

Guarde os IDs retornados na sua base de dados para referência futura.

## Deploy

A Edge Function `platform-api` é deployada com:

```bash
supabase functions deploy platform-api
```

Certifique-se de que `verify_jwt = false` em `supabase/config.toml` (autenticação é feita via `api_access_token`).
