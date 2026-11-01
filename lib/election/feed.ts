import { buildSnapshot, parseUnitStatuses, SOURCE_BASE, SOURCE_PAGE } from './adapter.ts';
import type { FeedResponse, Snapshot } from './types.ts';
import initialSnapshot from './seed.json' with { type: 'json' };
import { collectionPolicy, refreshIsDue, REFRESH_MS } from './policy.ts';

const ELECTION_ID = '2026-11-03';
type StateRow = { id: string; snapshot: string; last_attempt: number; last_success: number; lock_until: number; last_error: string | null };
const seed = initialSnapshot as Snapshot;
export function createFeed(env: { DB: D1Database }) {
function database() { if (!env.DB) throw new Error('Results database is not configured'); return env.DB; }

async function readState(db: D1Database): Promise<StateRow> {
  await db.prepare('INSERT INTO election_state (id, snapshot) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(ELECTION_ID, JSON.stringify(seed)).run();
  const row = await db.prepare('SELECT * FROM election_state WHERE id = ?').bind(ELECTION_ID).first<StateRow>();
  if (!row) throw new Error('Could not initialize election state');
  return row;
}
async function upstream(url: string, maxBytes: number) {
  const response = await fetch(url, { headers: { 'User-Agent': 'STCC-Election-Tracker/1.0', 'Cache-Control': 'no-cache' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`County source returned HTTP ${response.status}`);
  const length = Number(response.headers.get('Content-Length') ?? 0); if (length > maxBytes) throw new Error('County source exceeds expected size');
  const text = await response.text(); if (text.length > maxBytes) throw new Error('County source exceeds expected size');
  return text;
}
async function refreshResults(): Promise<void> {
  const db = database(); const current = await readState(db); const now = Date.now();
  if (!refreshIsDue(JSON.parse(current.snapshot) as Snapshot, now, current.last_attempt)) return;
  const acquired = await db.prepare('UPDATE election_state SET lock_until = ?, last_attempt = ? WHERE id = ? AND lock_until < ? AND last_attempt < ?').bind(now + 55_000, now, ELECTION_ID, now, now - REFRESH_MS).run();
  if (!acquired.meta.changes) return;
  try {
    const [xml, csv] = await Promise.all([upstream(`${SOURCE_BASE}summary_33.xml`, 2_000_000), upstream(`${SOURCE_BASE}Precincts_33.csv`, 3_000_000)]);
    const previousRow = await readState(db); const previous = JSON.parse(previousRow.snapshot) as Snapshot;
    // Preserve known statuses if the optional human-facing page is unavailable.
    let statuses = Object.fromEntries(previous.contests.flatMap(c => c.units.map(u => [u.id, u.status])));
    let snapshot = await buildSnapshot(xml, csv, { expectedContests: 50, statuses });
    if (snapshot.dataHash !== previous.dataHash) {
      try { const current = parseUnitStatuses(await upstream(SOURCE_PAGE, 15_000_000)); if (Object.keys(current).length) statuses = current; }
      catch { /* Summary reporting counts and vote totals remain usable without map statuses. */ }
      snapshot = await buildSnapshot(xml, csv, { expectedContests: 50, statuses });
    }
    const savedAt = Date.now(); const payload = JSON.stringify(snapshot);
    await db.batch([
      db.prepare('INSERT INTO election_snapshots (hash, election_id, generated_at, saved_at, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING').bind(snapshot.dataHash, ELECTION_ID, snapshot.generatedAt, savedAt, payload),
      db.prepare('UPDATE election_state SET snapshot = ?, last_success = ?, lock_until = 0, last_error = NULL WHERE id = ?').bind(payload, savedAt, ELECTION_ID),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 350) : 'Unknown ingestion failure';
    console.error('Election ingestion failed', { election: ELECTION_ID, detail });
    const message = /out of sync|coverage|candidate|CSV|XML|election ID|contests/.test(detail)
      ? 'The county files could not be reconciled. Waiting for a consistent report.'
      : 'The county feed is temporarily unavailable. Automatic checks will continue.';
    await db.prepare('UPDATE election_state SET last_error = ?, lock_until = 0 WHERE id = ?').bind(message, ELECTION_ID).run();
  }
}
async function getFeed(refresh = true): Promise<FeedResponse> {
  try {
    const db = database();
    if (refresh) await refreshResults();
    const row = await readState(db);
    const snapshot = JSON.parse(row.snapshot) as Snapshot; const policy = collectionPolicy(snapshot, Date.now(), row.last_attempt);
    return { snapshot, health: { state: row.last_error && policy.state === 'active' ? 'stale' : row.last_success ? 'healthy' : 'saved', lastChecked: row.last_attempt ? new Date(row.last_attempt).toISOString() : null, lastSuccess: row.last_success ? new Date(row.last_success).toISOString() : null, error: policy.state === 'active' ? row.last_error : null, refreshing: policy.state === 'active' && row.lock_until > Date.now(), collection: policy } };
  } catch {
    return { snapshot: seed, health: { state: 'saved', lastChecked: null, lastSuccess: null, error: 'Live storage is unavailable. Displaying the saved county zero report.', refreshing: false, collection: collectionPolicy(seed, Date.now()) } };
  }
}
async function getHistory() {
  const db = database();
  const result = await db.prepare('SELECT hash, generated_at, saved_at FROM election_snapshots WHERE election_id = ? ORDER BY saved_at DESC LIMIT 200').bind(ELECTION_ID).all<{ hash: string; generated_at: string; saved_at: number }>();
  return result.results;
}
async function getHistoricalSnapshot(hash: string): Promise<Snapshot | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const row = await database().prepare('SELECT payload FROM election_snapshots WHERE hash = ? AND election_id = ?').bind(hash, ELECTION_ID).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}

return { getFeed, refreshResults, getHistory, getHistoricalSnapshot };
}
