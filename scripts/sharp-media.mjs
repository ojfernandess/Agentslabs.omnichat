/**
 * Processamento local com Sharp (Node). As Edge Functions Supabase usam Deno + ImageScript;
 * use este script em pipelines ou workers Node quando precisar explicitamente do Sharp.
 *
 * Uso: node scripts/sharp-media.mjs <entrada.jpg> <saida.jpg> [largura_max]
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const [, , inPath, outPath, maxW] = process.argv;

if (!inPath || !outPath) {
  console.error('Uso: node scripts/sharp-media.mjs <entrada> <saida> [largura_max]');
  process.exit(1);
}

const width = maxW ? parseInt(maxW, 10) : 1200;

const buf = await readFile(path.resolve(inPath));
const out = await sharp(buf)
  .resize({ width, withoutEnlargement: true })
  .jpeg({ quality: 82 })
  .toBuffer();

await writeFile(path.resolve(outPath), out);
console.log('OK →', path.resolve(outPath));
