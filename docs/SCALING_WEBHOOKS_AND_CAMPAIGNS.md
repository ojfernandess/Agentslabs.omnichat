# Escalabilidade: webhooks Meta, filas e campanhas em massa

Este documento descreve o desenho para mitigar gargalos quando há **muito tráfego simultâneo**, **retries agressivos da Meta** (WhatsApp Cloud API) e **campanhas em massa** sujeitas aos **limites da Meta** (throughput por número/app).

## 1. Problema

| Tema | Risco |
|------|--------|
| Edge Functions (Supabase) | Escalam em instâncias, mas cada invocação tem **CPU limitada** (burst ~400 ms no plano típico) e **sem estado**. Trabalho pesado na mesma request bloqueia o ACK ao webhook. |
| Meta WhatsApp | Espera **HTTP 200** rapidamente (documentação indica responder em poucos segundos; na prática **< 20 s** para evitar retries duplicados). Se o Postgres ou o processamento forem lentos no pico, o webhook demora → **retries** → carga duplicada. |
| Campanhas | Disparar milhares de mensagens **dentro da mesma Edge Function** ou em loop síncrono viola boas práticas e pode **estourar quotas** da Meta (ex.: tier com teto de mensagens/segundo por número). |

## 2. Padrão: ACK rápido + fila durável + workers

```
Meta POST  →  Edge (valida assinatura)  →  INSERT webhook_ingest_jobs  →  200 OK (<~100 ms típ.)
                    ↓
Cron / schedule  →  process-webhook-ingest  →  POST interno meta-whatsapp-webhook (_internal_process)
                    ↓
              processWhatsAppPayload (Postgres, Storage, S3, outbound queue…)
```

- **Fila** (`webhook_ingest_jobs`): Postgres com `claim_webhook_ingest_jobs` (**SKIP LOCKED**) para vários workers sem corrida.
- **Idempotência**: `dedupe_key` derivada do `messages[].id` ou `statuses[].id` (ou hash do body) — índice único só para linhas `pending`/`processing`.
- **Desligar ACK rápido** (só para debug): secret `META_WEBHOOK_FAST_ACK=false` — processa na mesma request (comportamento antigo).

## 3. Configuração

### Secrets (Edge Functions)

| Variável | Descrição |
|----------|-----------|
| `META_WEBHOOK_FAST_ACK` | `true` (default se omitido) = enfileira e responde 200; `false` = processamento síncrono. |
| `INTERNAL_HOOK_SECRET` | Já usado; obrigatório para `process-webhook-ingest` e chamada interna ao `meta-whatsapp-webhook`. |

### Agendar o worker

#### Opção A — Cron no Dashboard (Supabase): HTTP ou Edge Function

No painel: **Database** → **Cron** (ou **Integrations** → **Cron**, conforme a versão do projeto) → **Create a new cron job**.

1. **Nome:** ex. `process-webhook-ingest` (não pode ser renomeado depois).
2. **Schedule:** expressão cron, por exemplo:
   - `* * * * *` = **cada minuto** (o preview mostra “every minute” em GMT).
   - Ou `*/2 * * * *` = a cada 2 minutos.
3. **Tipo:**  
   - **HTTP Request** ou **Supabase Edge Function** só aparecem se a extensão **`pg_net`** estiver instalada.  
   - Se vir o aviso *“pg_net needs to be installed”*: vá a **Database** → **Extensions** → ative **`pg_net`** (e confirme que **`pg_cron`** está ativo). Depois volte a criar o job.

**Se escolher HTTP Request**

| Campo | Valor |
|--------|--------|
| URL | `https://<PROJECT_REF>.supabase.co/functions/v1/process-webhook-ingest` |
| Método | `POST` |
| Headers | `Authorization: Bearer <INTERNAL_HOOK_SECRET>` e `Content-Type: application/json` |
| Body (opcional) | `{"batch_size":25}` |

Substitua `<PROJECT_REF>` pelo ID do projeto (Settings → API → Project URL) e `<INTERNAL_HOOK_SECRET>` pelo mesmo segredo das outras funções internas (**Edge Functions → Secrets**).

**Se escolher Supabase Edge Function**

- Selecione a função **`process-webhook-ingest`** na lista.
- Confirme na documentação do Supabase se o cron injeta auth automaticamente; se o worker responder **401**, use antes a opção **HTTP Request** com o header `Authorization` explícito.

**Se escolher SQL Snippet** (sem `pg_net` para HTTP)

- Pode chamar uma **database function** que use `net.http_post` **depois** de `pg_net` instalado, ou agendar apenas lógica SQL. Para invocar a Edge Function, o caminho prático é **ativar `pg_net`** e usar **HTTP Request** ou um cron externo (Opção B).

#### Opção B — Cron externo (sem pg_net)

Qualquer serviço que faça `POST` periódico:

```bash
curl -sS -X POST \
  "https://<PROJECT_REF>.supabase.co/functions/v1/process-webhook-ingest" \
  -H "Authorization: Bearer <INTERNAL_HOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":25}'
```

Ex.: **GitHub Actions** (`schedule`), **Easypanel** cron, **cron** no VPS, etc.

#### Resumo

- **Função:** `process-webhook-ingest`
- **Método:** `POST` com header `Authorization: Bearer <INTERNAL_HOOK_SECRET>`
- **Frequência:** a cada **1–2 min** é um bom ponto de partida; ajuste à carga.

Corpo opcional: `{ "batch_size": 25 }` (máx. 50).

### Evolution API / outros webhooks

O mesmo padrão pode ser replicado: ACK rápido + tabela de fila + worker, ou reutilizar `webhook_ingest_jobs` com `source` (requer migração futura).

## 4. Campanhas em massa

**Não** enviar listas inteiras a partir da UI ou de uma única Edge sem fila.

1. **Tabela** `campaign_send_jobs` — um registo por destinatário (fan-out separado: SQL, job ou função).
2. **Worker** `campaign-worker` — lê jobs `pending`, chama `send-whatsapp` (já autenticado com `INTERNAL_HOOK_SECRET`), **espaço temporal** entre envios (`CAMPAIGN_SEND_PER_SECOND`, default **5**).
3. **Limites Meta** — ajustar `CAMPAIGN_SEND_PER_SECOND` ao número de envios/segundo permitidos pelo **nível de qualidade** e **tier** da conta (valores como 1000 msg/s são **globais** à infraestrutura Meta, não por app; na prática use **conservador** por org).

**Popular a fila:** ainda não há fan-out automático no UI; use SQL/Edge dedicada. Exemplo (ajuste colunas ao seu schema):

```sql
INSERT INTO campaign_send_jobs (
  campaign_id, organization_id, channel_id, contact_id, phone, message_body, status, scheduled_for, next_attempt_at
)
SELECT
  c.id,
  c.organization_id,
  c.channel_id,
  ct.id,
  ct.phone,
  c.message_body,
  'pending',
  now(),
  now()
FROM campaigns c
JOIN contacts ct ON ct.organization_id = c.organization_id
WHERE c.id = $campaign_id
  AND c.status = 'draft';
-- depois: UPDATE campaigns SET status = 'scheduled' WHERE id = $campaign_id;
```

## 5. Observabilidade

- **Filas:** `SELECT status, count(*) FROM webhook_ingest_jobs GROUP BY status;`
- **Atraso:** `now() - created_at` para `pending` antigos.
- **Alertas:** fila `pending` > N ou idade máxima > T minutos.

## 6. Ficheiros e migração

- Migração: `supabase/migrations/*_webhook_ingest_campaign_queues.sql`
- Funções: `process-webhook-ingest`, `campaign-worker`, alteração em `meta-whatsapp-webhook` (FAST_ACK + rota interna `_internal_process`).

## 7. Referências

- [WhatsApp Cloud API — Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components)
- [Supabase Edge Functions — limits](https://supabase.com/docs/guides/functions/limits)
- `docs/DEPLOYMENT_ARCHITECTURE.md` — mídia externa (S3) e funções
