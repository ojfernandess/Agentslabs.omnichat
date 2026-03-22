Referência / cópia manual — o deploy remoto do Supabase empacota apenas o ficheiro index.ts de cada função.
O código partilhado foi inlinado em cada supabase/functions/<nome>/index.ts.
Ao alterar lógica comum, edite cada index.ts ou copie trechos desta pasta para manter consistência.

s3-media.ts — REFERÊNCIA apenas. O deploy remoto (supabase functions deploy) NÃO inclui ../_shared:
o código S3 está DUPLICADO (inline) no topo de process-media, upload-media, evolution-whatsapp-webhook e meta-whatsapp-webhook/index.ts.
Ao alterar a lógica S3, atualize _shared/s3-media.ts E cada index.ts listado acima.
