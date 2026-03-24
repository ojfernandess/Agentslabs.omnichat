# Supabase Cloud + MinIO — secrets das Edge Functions

## Problema comum

Variáveis como `S3_MEDIA_*` e `MEDIA_PUBLIC_BASE_URL` no **`.env` local** (Vite / Docker) **não** são enviadas automaticamente para as **Edge Functions** do projeto no Supabase Cloud.

Com `VITE_EXTERNAL_MEDIA_STORAGE=true`, o browser chama a função `upload-media`. Se essa função **não** tiver as secrets S3 no painel (ou via CLI), antes recebia **503**; agora há **fallback** para o bucket Supabase `message-media`, mas para usar **MinIO de verdade** é obrigatório configurar as secrets.

O mesmo vale para:

- `evolution-whatsapp-webhook` — gravar mídia recebida (cliente → plataforma)
- `process-media` — comprimir imagem enviada pelo atendente
- `meta-whatsapp-webhook` — conforme o fluxo

Desenho alvo (fluxos, presign, webhook, operações): **[MINIO_MEDIA_ARCHITECTURE.md](./MINIO_MEDIA_ARCHITECTURE.md)**.

## O que fazer (Supabase CLI)

Ligue o projeto (uma vez):

```bash
supabase link --project-ref SEU_PROJECT_REF
```

Defina as secrets (use os **mesmos** valores do seu MinIO; não commite ficheiros com chaves reais):

```bash
supabase secrets set S3_MEDIA_ENDPOINT="https://s3.seudominio.com"
supabase secrets set S3_MEDIA_REGION="us-east-1"
supabase secrets set S3_MEDIA_ACCESS_KEY="..."
supabase secrets set S3_MEDIA_SECRET_KEY="..."
supabase secrets set S3_MEDIA_FORCE_PATH_STYLE="true"
supabase secrets set S3_MEDIA_BUCKET_MESSAGE="message-media"
supabase secrets set S3_MEDIA_BUCKET_INBOX="inbox-avatars"
supabase secrets set MEDIA_PUBLIC_BASE_URL="https://cdn.seudominio.com"
```

**Nota:** `MEDIA_PUBLIC_BASE_URL` deve ser a base pública onde o browser e o WhatsApp/Evolution conseguem fazer **GET** no ficheiro. O código monta URLs assim:

`{MEDIA_PUBLIC_BASE_URL}/{bucket}/{key}`  

Exemplo: `https://cdn.exemplo.com/message-media/org-id/conv-id/uuid.jpg`

Confirme no browser que essa URL abre sem 403 (bucket/policy ou reverse proxy).

## MinIO: endpoint da API S3 (documentação oficial)

Os clientes compatíveis com S3 (AWS SDK nas Edge Functions) falam com o **endpoint da API**, não só com URLs públicas de leitura. Se o reverse proxy expuser apenas GET estático e **não** encaminhar `PUT`/`DELETE` assinados para o MinIO, o probe `s3_write_probe` e o `upload-media` falham com timeout ou erro de rede — mesmo quando `…/bucket/test.txt` abre no browser.

Na documentação do MinIO:

- **[Settings and Configurations](https://min.io/docs/minio/linux/reference/minio-server/settings.html)** — índice das variáveis de ambiente; a secção **Site settings** inclui a URL pública do site (útil quando o MinIO está atrás de proxy ou TLS terminado à frente).
- **[Core settings](https://min.io/docs/minio/linux/reference/minio-server/settings/core.html)** — `MINIO_ADDRESS` (host:porta onde o servidor escuta), `MINIO_DOMAIN` (pedidos em estilo *virtual host* `bucket.host` em alternativa a *path-style* `host/bucket/...`). O vosso `S3_MEDIA_FORCE_PATH_STYLE` e o hostname do `S3_MEDIA_ENDPOINT` devem estar alinhados com isto.
- **[Core concepts](https://min.io/docs/minio/linux/operations/concepts.html)** — descreve o uso de *load balancer* à frente do cluster; as aplicações devem usar o endpoint que o balanceador expõe para a API S3.

Em muitos deployments atrás de nginx/Traefik define-se também uma variável de **URL pública do servidor** (na documentação atual aparece sob *Site settings*, por vezes referida como `MINIO_SERVER_URL` em guias e issues) para o MinIO gerar links e assinaturas coerentes com o hostname externo. O valor deve ser o **mesmo esquema e host** que usam os clientes na rede (por exemplo `https://s3.exemplo.com`), sem path de bucket no fim.

**Resumo para Supabase Edge:** `S3_MEDIA_ENDPOINT` = URL base **alcançável a partir da cloud Supabase** onde a API S3 responde (incluindo `PUT`). `MEDIA_PUBLIC_BASE_URL` = base onde o WhatsApp/browser fazem **GET** ao objeto; pode ser o mesmo host se o proxy tratar ambos, ou diferente se usar CDN só para leitura.

## Redeploy das funções

Depois de alterar secrets:

```bash
supabase functions deploy upload-media
supabase functions deploy evolution-whatsapp-webhook
supabase functions deploy process-media
supabase functions deploy media-presign
supabase functions deploy minio-media-webhook
```

(Deploy só das que usa.)

## Painel Supabase

Alternativa: **Project Settings → Edge Functions → Secrets** — adicionar manualmente as mesmas chaves.

## Evolution API (recebimento de imagens)

1. Em `channels.config.evolution`: `base_url`, `api_key`, `instance_name`.
2. Opcional mas recomendado: `webhook_base64: true` na instância Evolution para receber base64 no webhook.
3. Webhook URL:  
   `{SUPABASE_URL}/functions/v1/evolution-whatsapp-webhook?channel_id={UUID_DA_CAIXA}`

## Segurança

Se as chaves S3 já apareceram em repositório ou chat, **rode credenciais novas** no MinIO e atualize as secrets.
