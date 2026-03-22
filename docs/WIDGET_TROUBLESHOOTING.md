# Widget de Live Chat — Resolução de problemas

## O widget não aparece

### 1. Publicar a Edge Function

A função `get-widget-config` precisa estar publicada no Supabase. Se ainda não ligou o projeto:

```bash
supabase link
```

Depois publique a função:

```bash
supabase functions deploy get-widget-config
```

### 2. Testar localmente

Acesse `http://localhost:8080/widget-test.html` com o servidor em execução.

Edite o ficheiro `public/widget-test.html` e substitua:
- `SEU_TOKEN` — token público da caixa Live Chat (em Configurações → Caixas de Entrada → editar caixa Live Chat → Construtor de Widget → copiar do script)
- `SUA_API_URL` — URL das Edge Functions, ex: `https://SEU_PROJETO.supabase.co/functions/v1`

### 3. Verificar variáveis de ambiente

No `.env`:
- `VITE_SUPABASE_URL` — URL do projeto Supabase
- `VITE_PUBLIC_APP_URL` — URL da aplicação (para produção)

### 4. Script correto

O snippet deve ter **ambos** os atributos:

```html
<script 
  src="https://sua-app.com/widget.js" 
  data-inbox-token="UUID-DA-CAIXA" 
  data-api-url="https://SEU_PROJETO.supabase.co/functions/v1" 
  defer
></script>
```

### 5. Mixed content

Se o seu site é **HTTPS**, o `src` do script também deve ser **HTTPS**. `http://localhost` não funciona em páginas HTTPS.

### 6. Caixa ativa

A caixa de entrada deve estar **ativa** (toggle em Configurações). Se estiver inativa, a API retorna 404.

### 7. Console do navegador

Abra as ferramentas de desenvolvimento (F12) → Aba **Console**. Procure mensagens `[Widget]` para erros.
