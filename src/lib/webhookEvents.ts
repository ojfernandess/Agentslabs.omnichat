/** Catálogo de eventos — alinhado à Seção 19.3 do prompt técnico */
export const WEBHOOK_EVENT_GROUPS = [
  {
    label: 'Conversa',
    events: [
      { id: 'conversation_created', label: 'Conversa criada' },
      { id: 'conversation_updated', label: 'Conversa atualizada' },
      { id: 'conversation_status_changed', label: 'Status da conversa alterado' },
      { id: 'conversation_assigned', label: 'Conversa atribuída' },
      { id: 'conversation_unassigned', label: 'Atribuição removida' },
      { id: 'conversation_resolved', label: 'Conversa resolvida' },
      { id: 'conversation_reopened', label: 'Conversa reaberta' },
      { id: 'conversation_label_added', label: 'Etiqueta adicionada' },
      { id: 'conversation_label_removed', label: 'Etiqueta removida' },
      { id: 'conversation_priority_changed', label: 'Prioridade alterada' },
    ],
  },
  {
    label: 'Mensagem',
    events: [
      { id: 'message_created', label: 'Mensagem criada' },
      { id: 'message_updated', label: 'Mensagem atualizada' },
      { id: 'message_deleted', label: 'Mensagem removida' },
    ],
  },
  {
    label: 'Contato',
    events: [
      { id: 'contact_created', label: 'Contato criado' },
      { id: 'contact_updated', label: 'Contato atualizado' },
      { id: 'contact_merged', label: 'Contatos mesclados' },
      { id: 'contact_deleted', label: 'Contato excluído' },
    ],
  },
  {
    label: 'Outros',
    events: [
      { id: 'webwidget_triggered', label: 'Widget live chat aberto' },
      { id: 'csat_survey_submitted', label: 'CSAT respondido' },
      { id: 'sla_missed_first_response', label: 'SLA primeira resposta violado' },
      { id: 'sla_missed_resolution', label: 'SLA resolução violado' },
      { id: 'agent_bot_handoff', label: 'Handoff do bot para humano' },
      { id: 'inbox_created', label: 'Caixa criada' },
      { id: 'automation_triggered', label: 'Automação disparada' },
    ],
  },
] as const;

export const ALL_WEBHOOK_EVENT_IDS = WEBHOOK_EVENT_GROUPS.flatMap((g) =>
  g.events.map((e) => e.id)
);
