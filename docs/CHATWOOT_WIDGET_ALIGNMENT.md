# Alinhamento com a documentação Chatwoot

Este documento descreve como o widget de Live Chat do sistema está alinhado com a [documentação oficial do Chatwoot](https://www.chatwoot.com/docs/product/channels/live-chat/sdk/setup).

## Configurações do widget (window.chatwootSettings)

| Chatwoot | Nosso sistema | Descrição |
|----------|---------------|-----------|
| `position: "left" \| "right"` | `position: "left" \| "right"` | Posição do launcher (esquerda ou direita) |
| `type: "standard" \| "expanded_bubble"` | `type: "standard" \| "expanded_bubble"` | **standard**: ícone circular; **expanded_bubble**: cápsula/pílula com texto |
| `launcherTitle` | `launcherTitle` | Texto exibido no bubble expandido (quando type=expanded_bubble) |
| `welcomeTitle` | `welcomeTitle` | Título de boas-vindas no cabeçalho do widget |
| `welcomeDescription` | `welcomeDescription` | Subtítulo/descrição de boas-vindas |
| `availableMessage` | `availableMessage` | Mensagem quando equipe está online |
| `unavailableMessage` | `unavailableMessage` | Mensagem quando equipe está offline |
| - | `widgetColor` | Cor hex do widget (Chatwoot usa widget_color na API) |

## Tipos de balão

- **standard**: Ícone circular compacto que flutua no canto do site (padrão Chatwoot)
- **expanded_bubble**: Cápsula mais larga com texto personalizado (ex: "Fale conosco no chat")

## Padrão de script (Chatwoot)

O Chatwoot define `window.chatwootSettings` **antes** de carregar o SDK. Nosso sistema suporta o mesmo padrão com `window.agentslabsWidgetSettings`:

```html
<!-- Opcional: sobrescrever configurações antes do carregamento -->
<script>
window.agentslabsWidgetSettings = {
  position: "right",
  type: "expanded_bubble",
  launcherTitle: "Fale conosco no chat",
  welcomeTitle: "Olá!",
  welcomeDescription: "Como posso ajudar?"
};
</script>
<script src="https://seu-app.com/widget.js" data-inbox-token="SEU_TOKEN" data-api-url="https://xxx.supabase.co/functions/v1"></script>
```

Configurações definidas em `agentslabsWidgetSettings` sobrescrevem as da API quando o widget carrega.

## Formulário Chat Pré (Pre-Chat Form)

O sistema inclui aba "Formulário Chat Pré" para caixas Live Chat, alinhada à [documentação Chatwoot](https://www.chatwoot.com/hc/user-guide/articles/1677688647-how-to-use-pre_chat-forms):

- **Ativar/desativar** o formulário antes da conversa
- **Mensagem pré chat** – texto exibido acima dos campos
- **Campos padrão**: emailAddress (email), fullName (text), phoneNumber (text)
- **Por campo**: Chave, Tipo (text/email/number), Obrigatório, Nome do campo, Valor de exemplo, Ativo

Os dados coletados são enviados como `prechat_*` na URL ao abrir a conversa.

## Referências

- [Chatwoot SDK Settings](https://chatwoot.com/hc/user-guide/articles/1677587234-how-to-send-additional-user-information-to-chatwoot-using-sdk)
- [Widget Customization](https://www.chatwoot.com/features/widget-customization)
- [Pre-Chat Forms](https://www.chatwoot.com/hc/user-guide/articles/1677688647-how-to-use-pre_chat-forms)
- [Create Website Inbox API](https://developers.chatwoot.com/api-reference/inboxes/create-an-inbox)
