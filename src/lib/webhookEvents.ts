/** Catálogo de eventos — Chatwoot parity + extensões */
export const WEBHOOK_EVENT_GROUPS = [
  {
    label: 'Conversation (Chatwoot)',
    events: [
      { id: 'conversation_created', label: 'Conversation created' },
      { id: 'conversation_status_changed', label: 'Conversation status changed' },
      { id: 'conversation_updated', label: 'Conversation updated' },
      { id: 'conversation_assigned', label: 'Conversation assigned' },
      { id: 'conversation_unassigned', label: 'Conversation unassigned' },
      { id: 'conversation_resolved', label: 'Conversation resolved' },
      { id: 'conversation_reopened', label: 'Conversation reopened' },
      { id: 'conversation_label_added', label: 'Label added' },
      { id: 'conversation_label_removed', label: 'Label removed' },
      { id: 'conversation_priority_changed', label: 'Priority changed' },
    ],
  },
  {
    label: 'Message',
    events: [
      { id: 'message_created', label: 'Message created' },
      { id: 'message_updated', label: 'Message updated' },
      { id: 'message_deleted', label: 'Message deleted' },
    ],
  },
  {
    label: 'Contact',
    events: [
      { id: 'contact_created', label: 'Contact created' },
      { id: 'contact_updated', label: 'Contact updated' },
      { id: 'contact_merged', label: 'Contacts merged' },
      { id: 'contact_deleted', label: 'Contact deleted' },
    ],
  },
  {
    label: 'Other',
    events: [
      { id: 'webwidget_triggered', label: 'Web widget triggered' },
      { id: 'csat_survey_submitted', label: 'CSAT survey submitted' },
      { id: 'sla_missed_first_response', label: 'SLA first response missed' },
      { id: 'sla_missed_resolution', label: 'SLA resolution missed' },
      { id: 'agent_bot_handoff', label: 'Agent bot handoff' },
      { id: 'inbox_created', label: 'Inbox created' },
      { id: 'automation_triggered', label: 'Automation triggered' },
    ],
  },
] as const;

export const ALL_WEBHOOK_EVENT_IDS = WEBHOOK_EVENT_GROUPS.flatMap((g) =>
  g.events.map((e) => e.id)
);
