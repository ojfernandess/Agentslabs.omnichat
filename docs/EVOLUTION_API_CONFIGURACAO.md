# Configuração Evolution API + Agents Labs

Guia passo a passo para integrar uma instância Evolution API (WhatsApp via Baileys) com o sistema Agents Labs.

---

## 1. Pré-requisitos

- Servidor Evolution API instalado e acessível (Docker ou cloud)
- Conta no Supabase com o projeto Agents Labs configurado
- Acesso ao painel Agents Labs (Caixas de entrada, Conversas)

---

## 2. Configurar a instância na Evolution API

### 2.1 Criar ou acessar a instância

1. Acesse o painel da Evolution (ex.: `https://evolutionapi.agentslabs.cloud/manager`)
2. Crie uma nova instância ou use uma existente
3. Conecte o WhatsApp escaneando o QR Code
4. Aguarde o status **Conectado**
5. Anote:
   - **Nome da instância** (ex.: `Teste Labs`) — será usado em todos os passos
   - **URL base da API** — apenas o domínio, sem `/manager` (ex.: `https://evolutionapi.agentslabs.cloud`)

### 2.2 Obter a API Key

- A API Key fica nas configurações do servidor Evolution (variável de ambiente ou painel)
- Será usada no header `apikey` em todas as requisições à API

---

## 3. Configurar a caixa no Agents Labs

### 3.1 Criar a caixa

1. No Agents Labs, vá em **Configurações → Caixas de entrada** (ou **Settings → Inboxes**)
2. Clique em **Nova caixa de entrada**
3. Escolha o provedor **WhatsApp**

### 3.2 Selecionar Evolution API

1. No passo de credenciais, selecione **Evolution API** (não Meta Cloud API)
2. Preencha os campos:
   - **URL base da API:** `https://evolutionapi.agentslabs.cloud` (sem barra no final)
   - **API Key:** a chave do seu servidor Evolution
   - **Nome da instância:** ex.: `Teste Labs` (exatamente como aparece na Evolution)
   - **Secret do webhook (opcional):** se quiser validar chamadas com `?secret=...` na URL
3. Avance para **Mensagens, equipa e SLA** (configurações opcionais)
4. Revise e clique em **Criar caixa**

### 3.3 Copiar o ID da caixa

1. Na tela de sucesso, copie a **URL do webhook** exibida ou o **ID da caixa**
2. O ID é o UUID que aparece em `channel_id=...` na URL do webhook  
   Exemplo: `https://seu-projeto.supabase.co/functions/v1/evolution-whatsapp-webhook?channel_id=abc123-def456-...`  
   O `abc123-def456-...` é o **ID da caixa** — guarde-o

---

## 4. Registrar o webhook na Evolution API

### 4.1 Via API (recomendado)

Envie um **POST** para o servidor Evolution:

```
POST https://evolutionapi.agentslabs.cloud/webhook/set/Teste%20Labs
```

**Headers:**
```
Content-Type: application/json
apikey: SUA_API_KEY
```

**Body (JSON):**
```json
{
  "enabled": true,
  "url": "https://uyagfnkcmcuijlzshmog.supabase.co/functions/v1/evolution-whatsapp-webhook?channel_id=ID_DA_CAIXA",
  "webhookByEvents": false,
  "webhookBase64": false,
  "events": [
    "MESSAGES_UPSERT",
    "CONNECTION_UPDATE"
  ]
}
```

Troque:
- `Teste%20Labs` pelo nome da sua instância (com espaço codificado como `%20`)
- `ID_DA_CAIXA` pelo UUID da caixa copiado do Agents Labs
- `https://uyagfnkcmcuijlzshmog.supabase.co` pela URL do seu projeto Supabase, se for diferente

### 4.2 Via interface do Evolution Manager

Se o seu painel Evolution tiver tela de configuração de webhook:

1. Abra as **configurações** ou **webhook** da instância
2. Cole a URL completa:  
   `https://seu-projeto.supabase.co/functions/v1/evolution-whatsapp-webhook?channel_id=ID_DA_CAIXA`
3. Ative os eventos: **MESSAGES_UPSERT** (obrigatório) e **CONNECTION_UPDATE** (opcional)
4. Salve

---

## 5. Validar a integração

### 5.1 Mensagens recebidas

1. Envie uma mensagem de teste para o número WhatsApp conectado na Evolution
2. A Evolution envia o evento para o webhook do Supabase
3. A mensagem deve aparecer em **Conversas** no Agents Labs

### 5.2 Enviar mensagem

1. Abra uma conversa no Agents Labs
2. Digite e envie uma mensagem
3. A mensagem deve ser entregue no WhatsApp via Evolution API

### 5.3 Verificar contato e foto de perfil

1. Abra uma conversa de um canal WhatsApp configurado com Evolution API
2. No painel **Contatos** à direita, a foto de perfil é obtida automaticamente via Evolution API
3. Use o botão de atualizar (ícone circular) para forçar a verificação do contato e atualizar a foto
4. O painel exibe também: nome, e-mail, telefone, WhatsApp ID (`número@s.whatsapp.net`) com opção de copiar

---

## 6. Resumo rápido

| O que | Onde pegar |
|-------|------------|
| URL base da API | Domínio do seu Evolution (ex.: `https://evolutionapi.agentslabs.cloud`) |
| API Key | Configurações do servidor Evolution |
| Nome da instância | Painel Evolution — ex.: `Teste Labs` |
| ID da caixa | Tela de sucesso ao criar a caixa no Agents Labs ou Supabase → tabela `channels` |
| URL do webhook | `https://SEU_PROJETO.supabase.co/functions/v1/evolution-whatsapp-webhook?channel_id=ID_DA_CAIXA` |

---

## 7. Troubleshooting

- **Mensagens não chegam:** Verifique se o webhook está registrado na Evolution com o evento `MESSAGES_UPSERT` e se o `channel_id` é o da caixa criada no Agents Labs (não o ID da instância Evolution).
- **Erro 404 no webhook:** Confirme que as Edge Functions foram publicadas:  
  `supabase functions deploy evolution-whatsapp-webhook`  
  `supabase functions deploy fetch-whatsapp-profile` (para verificar contato e foto)
- **Erro ao enviar:** Confirme URL base, API Key e nome da instância. O nome deve ser exatamente o mesmo da Evolution (com espaço se tiver).
- **Erro 502 "phone_number_id e access_token devem estar em config.meta":** A caixa foi criada como **Meta** (ou sem config Evolution). Para Evolution API funcionar no envio, a caixa **precisa ser criada escolhendo "Evolution API"** no assistente — não "Meta Cloud API". Se a caixa foi criada antes ou por engano com Meta, crie uma nova caixa selecionando **Evolution API** e preenchendo base_url, api_key e instance_name; depois registre o webhook na Evolution com o novo `channel_id`.
- **Canal não encontrado:** O `channel_id` na URL do webhook deve ser o UUID da tabela `channels` do Supabase, não o ID da instância no Evolution Manager.
