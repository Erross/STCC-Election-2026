import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const id = process.env.CLOUDFLARE_DATABASE_ID;
if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) || id.startsWith('00000000-')) {
  throw new Error('Set CLOUDFLARE_DATABASE_ID to the new STCC D1 database ID before deployment.');
}
config.d1_databases[0].database_id = id;
writeFileSync(new URL('../wrangler.generated.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log('Configured new STCC Worker and D1 binding.');
