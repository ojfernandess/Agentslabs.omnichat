/** Chaves de permissão opcionais (funções personalizadas). Aplicação pode ler estas flags no futuro. */
export const ORG_PERMISSION_KEYS = [
  { key: 'view_analytics', label: 'Ver relatórios / analytics' },
  { key: 'manage_campaigns', label: 'Gerir campanhas' },
  { key: 'manage_help_center', label: 'Gerir central de ajuda' },
  { key: 'manage_automation', label: 'Gerir automação e macros' },
  { key: 'manage_sla', label: 'Gerir SLA' },
  { key: 'manage_teams', label: 'Gerir times' },
  { key: 'manage_channels', label: 'Gerir caixas de entrada' },
  { key: 'manage_billing', label: 'Facturação (placeholder)' },
] as const;
