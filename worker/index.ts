import { createFeed } from '../lib/election/feed.ts';
import { hashContent } from '../lib/election/adapter.ts';

export interface Env { DB: D1Database; ALLOWED_ORIGINS: string; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = new Set(env.ALLOWED_ORIGINS.split(',').map(s => s.trim()));
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
    if (origin && !allowed.has(origin)) return Response.json({ error: 'Origin not allowed' }, { status: 403, headers });
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'ETag');
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'If-None-Match, Content-Type');
      headers.set('Access-Control-Max-Age', '3600');
      return new Response(null, { status: 204, headers });
    }
    const path = new URL(request.url).pathname;
    const feed = createFeed(env);
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
    try {
      if (path === '/api/refresh' && request.method === 'POST') {
        const { snapshot, health } = await feed.getFeed(true);
        return json({ dataHash: snapshot.dataHash, phase: snapshot.phase, contests: snapshot.contests.length, ...health }, health.state === 'stale' ? 503 : 200);
      }
      if (request.method !== 'GET') { headers.set('Allow', path === '/api/refresh' ? 'POST, OPTIONS' : 'GET, OPTIONS'); return json({ error: 'Method not allowed' }, 405); }
      if (path === '/api/results') {
        // Never block a public result request on county downloads or CSV/XML parsing.
        // The minute cron refreshes D1; readers only retrieve the last validated snapshot.
        const data = await feed.getFeed(false);
        const tag = '"' + await hashContent({ hash: data.snapshot.dataHash, health: data.health }) + '"';
        headers.set('ETag', tag);
        if (request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304, headers });
        return json(data);
      }
      if (path === '/api/health') {
        const { snapshot, health } = await feed.getFeed(false);
        return json({ election: snapshot.electionId, phase: snapshot.phase, dataHash: snapshot.dataHash, sourcePublished: snapshot.generatedAt, ...health });
      }
      if (path === '/api/history') return json(await feed.getHistory());
      const match = /^\/api\/history\/([a-f0-9]{64})$/.exec(path);
      if (match) { const snapshot = await feed.getHistoricalSnapshot(match[1]); return snapshot ? json(snapshot) : json({ error: 'Snapshot not found' }, 404); }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('STCC API request failed', error instanceof Error ? error.message : 'Unknown error');
      return json({ error: 'Results storage is temporarily unavailable' }, 503);
    }
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // The policy blocks upstream collection before polls close and after 100%.
    // Hourly invocations then return without retrieving county files.
    await createFeed(env).refreshResults();
  },
} satisfies ExportedHandler<Env>;
