import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { type Env } from '../worker/index.ts';
import { createFeed } from '../lib/election/feed.ts';

const file = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const xml = file('summary-33.xml');
const csv = file('precincts-33.csv');
const html = file('report-33.html');
const actualNow = Date.now;
const actualFetch = globalThis.fetch;
const afterClose = Date.parse('2026-11-04T02:00:00Z');

// Execute the real application SQL in SQLite behind a thin D1-shaped adapter.
function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_election.sql', import.meta.url), 'utf8'));
  const prepare = (query: string, values: (string | number | null)[] = []) => ({
    bind: (...next: (string | number | null)[]) => prepare(query, next),
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async all() { return { results: sql.prepare(query).all(...values) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
  });
  const env = { DB: { prepare, async batch(items: { run(): Promise<unknown> }[]) {
    sql.exec('BEGIN');
    try { const result = []; for (const item of items) result.push(await item.run()); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } }, ALLOWED_ORIGINS: 'https://erross.github.io' } as unknown as Env;
  return { env, sql, close() { sql.close(); Date.now = actualNow; globalThis.fetch = actualFetch; } };
}
function mockSources(summary = xml, precincts = csv) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.endsWith('summary_33.xml')) return new Response(summary);
    if (url.endsWith('Precincts_33.csv')) return new Response(precincts);
    if (url.endsWith('Index_33.html')) return new Response(html);
    throw new Error(`Unexpected upstream ${url}`);
  }) as typeof fetch;
  return calls;
}
const request = (path: string, init?: RequestInit) => new Request(`https://stcc-api.example${path}`, init);

test('Pages cross-origin conditional reads and preflight work; unlisted origins are rejected', async () => {
  const db = setup(); Date.now = () => 1; const calls = mockSources();
  try {
    const preflight = await worker.fetch(request('/api/results', { method: 'OPTIONS', headers: { Origin: 'https://erross.github.io', 'Access-Control-Request-Headers': 'if-none-match' } }), db.env);
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers')!, /If-None-Match/);
    const result = await worker.fetch(request('/api/results', { headers: { Origin: 'https://erross.github.io' } }), db.env);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://erross.github.io');
    assert.equal(result.headers.get('Access-Control-Expose-Headers'), 'ETag');
    const tag = result.headers.get('ETag')!;
    assert.equal((await worker.fetch(request('/api/results', { headers: { Origin: 'https://erross.github.io', 'If-None-Match': tag } }), db.env)).status, 304);
    assert.equal((await worker.fetch(request('/api/results', { headers: { Origin: 'https://unexpected.example' } }), db.env)).status, 403);
    assert.equal(calls.length, 0);
  } finally { db.close(); }
});

test('shared database rate limit survives separate requests and hourly invocations', async () => {
  const db = setup(); let now = afterClose; Date.now = () => now; const calls = mockSources();
  try {
    const response = await worker.fetch(request('/api/results'), db.env);
    assert.equal((await response.json() as any).health.state, 'healthy');
    const count = calls.length; assert.ok(count >= 2);
    await worker.fetch(request('/api/results'), db.env);
    await worker.scheduled({} as ScheduledController, db.env);
    assert.equal(calls.length, count);
    now += 60_001;
    await worker.scheduled({} as ScheduledController, db.env);
    assert.ok(calls.length > count);
    const revisions = await (await worker.fetch(request('/api/history'), db.env)).json() as { hash: string }[];
    assert.equal(revisions.length, 1);
    assert.equal((await worker.fetch(request(`/api/history/${revisions[0].hash}`), db.env)).status, 200);
  } finally { db.close(); }
});

test('bad county pairs keep the previous durable snapshot and expose stale status', async () => {
  const db = setup(); let now = afterClose; Date.now = () => now; mockSources();
  try {
    const feed = createFeed(db.env); const good = await feed.getFeed();
    now += 60_001; mockSources(xml, csv.slice(0, csv.lastIndexOf('\n', csv.length - 2)));
    const failed = await feed.getFeed();
    assert.equal(failed.snapshot.dataHash, good.snapshot.dataHash);
    assert.equal(failed.health.state, 'stale');
    assert.ok(failed.health.error);
  } finally { db.close(); }
});

test('completed snapshot is durable and every automatic collection path stops', async () => {
  const db = setup(); let now = afterClose; Date.now = () => now;
  const completeXml = xml.replace(/<Table>[\s\S]*?<\/Table>/g, block => block.replace(/<PrecReported>\d+<\/PrecReported>/, `<PrecReported>${block.match(/<NumberOfPrec>(\d+)<\/NumberOfPrec>/)![1]}</PrecReported>`));
  const calls = mockSources(completeXml);
  try {
    const completed = await (await worker.fetch(request('/api/results'), db.env)).json() as any;
    assert.equal(completed.snapshot.phase, 'complete');
    const count = calls.length;
    now += 86_400_000;
    await worker.scheduled({} as ScheduledController, db.env);
    await worker.fetch(request('/api/refresh', { method: 'POST' }), db.env);
    const restored = await (await worker.fetch(request('/api/results'), db.env)).json() as any;
    assert.equal(restored.snapshot.dataHash, completed.snapshot.dataHash);
    assert.equal(restored.health.collection.state, 'complete');
    assert.equal(calls.length, count);
  } finally { db.close(); }
});

test('health does not initiate collection and unexpected methods/routes cannot change results', async () => {
  const db = setup(); Date.now = () => afterClose; const calls = mockSources();
  try {
    assert.equal((await worker.fetch(request('/api/health'), db.env)).status, 200);
    assert.equal((await worker.fetch(request('/api/results', { method: 'DELETE' }), db.env)).status, 405);
    assert.equal((await worker.fetch(request('/api/history/not-a-hash'), db.env)).status, 404);
    assert.equal(calls.length, 0);
  } finally { db.close(); }
});
