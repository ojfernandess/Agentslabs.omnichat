/**
 * Mostrado quando o bundle foi construído sem VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
 * Essas variáveis são embutidas no build (Vite); não basta definir só no runtime do container.
 */
export default function MissingConfigPage() {
  const missingUrl = !import.meta.env.VITE_SUPABASE_URL?.trim();
  const missingKey = !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-2xl space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Configuração do Supabase em falta</h1>
        <p className="text-muted-foreground">
          O frontend foi construído sem as variáveis de ambiente do <strong className="text-foreground">Vite</strong>{" "}
          necessárias para ligar ao Supabase. Sem elas, a aplicação não pode carregar.
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          {missingUrl && (
            <li>
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">VITE_SUPABASE_URL</code> —
              URL do projeto (ex.: <code className="text-xs">https://xxx.supabase.co</code>)
            </li>
          )}
          {missingKey && (
            <li>
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">VITE_SUPABASE_PUBLISHABLE_KEY</code> —
              chave anon (publishable)
            </li>
          )}
          {!missingUrl && !missingKey && (
            <li>Valores presentes no bundle — se ainda vir esta página, faça um hard refresh (Ctrl+F5).</li>
          )}
        </ul>
        <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">Easypanel (Docker Compose)</p>
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
            <li>
              No projeto, abra <strong className="text-foreground">Environment</strong> e crie as variáveis acima com
              os mesmos nomes.
            </li>
            <li>
              Confirme que o painel as expõe ao <strong className="text-foreground">build</strong> do Docker Compose
              (não só ao container em execução). Sem isso, o <code className="text-xs">npm run build</code> corre
              sem valores e o bundle fica vazio.
            </li>
            <li>
              Faça <strong className="text-foreground">redeploy / rebuild</strong> após guardar as variáveis.
            </li>
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">
          Referência: <code className="rounded bg-muted px-1">deploy/easypanel.env.example</code> e{" "}
          <code className="rounded bg-muted px-1">deploy/EASYPANEL_GITHUB.md</code>
        </p>
      </div>
    </div>
  );
}
