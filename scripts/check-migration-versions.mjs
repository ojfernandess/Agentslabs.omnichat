/**
 * Garante que cada ficheiro em supabase/migrations/*.sql tem um prefixo de versão
 * único (parte antes do primeiro _). Dois ficheiros com o mesmo prefixo causam
 * duplicate key em schema_migrations no Postgres remoto.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "supabase", "migrations");

if (!fs.existsSync(dir)) {
  console.error("Pasta não encontrada:", dir);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
const byVer = new Map();

for (const f of files) {
  const ver = f.split("_")[0];
  if (!byVer.has(ver)) byVer.set(ver, []);
  byVer.get(ver).push(f);
}

const dup = [...byVer.entries()].filter(([, list]) => list.length > 1);
if (dup.length) {
  console.error(
    "Erro: prefixos de versão duplicados em supabase/migrations/*.sql.",
    "Cada migração precisa de um timestamp YYYYMMDDHHMMSS único antes do primeiro _.\n",
  );
  for (const [ver, list] of dup) {
    console.error(`  ${ver}: ${list.join(", ")}`);
  }
  process.exit(1);
}

console.log(`OK: ${files.length} migrações com versões únicas.`);
