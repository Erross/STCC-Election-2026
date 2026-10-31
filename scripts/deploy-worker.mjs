import './configure-worker.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mode = process.argv[2];
if (!['migrate', 'deploy'].includes(mode)) throw new Error('Expected migrate or deploy');
const command = mode === 'migrate'
  ? ['d1', 'migrations', 'apply', 'stcc-election-2026', '--remote', '--config', 'wrangler.generated.json']
  : ['deploy', '--config', 'wrangler.generated.json'];
const run = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...command], { stdio: 'inherit', env: process.env });
process.exit(run.status ?? 1);
