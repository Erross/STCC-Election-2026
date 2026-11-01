import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot } from '../lib/election/adapter.ts';
import { allContestsReported, collectionPolicy, refreshIsDue, COLLECTION_START } from '../lib/election/policy.ts';
import type { Snapshot } from '../lib/election/types.ts';
const xml = readFileSync(new URL('./fixtures/summary-33.xml', import.meta.url), 'utf8');
const csv = readFileSync(new URL('./fixtures/precincts-33.csv', import.meta.url), 'utf8');
const afterClose = Date.parse(COLLECTION_START) + 3_600_000;

test('page-driven backend refresh only becomes due after polls close and after the age threshold', async () => {
  const s = await buildSnapshot(xml, csv);
  assert.equal(refreshIsDue(s, Date.parse(COLLECTION_START) - 1), false);
  assert.equal(collectionPolicy(s, Date.parse(COLLECTION_START) - 1).state, 'scheduled');
  assert.equal(refreshIsDue(s, afterClose, afterClose - 59_999), false);
  assert.equal(refreshIsDue(s, afterClose, afterClose - 60_000), true);
});
test('one complete contest does not stop collection; every contest must reach its own denominator', async () => {
  const s = await buildSnapshot(xml, csv); s.contests[0].reported = s.contests[0].totalReportingUnits;
  assert.equal(allContestsReported(s.contests), false); assert.equal(refreshIsDue(s, afterClose), true);
  assert.equal(allContestsReported([]), false);
});
test('a reconciled 100% report is marked complete, cached, and never automatically refreshed again', async () => {
  const fullXml = xml.replace(/<Table>[\s\S]*?<\/Table>/g, block => block.replace(/<PrecReported>\d+<\/PrecReported>/, `<PrecReported>${block.match(/<NumberOfPrec>(\d+)<\/NumberOfPrec>/)![1]}</PrecReported>`));
  const s = await buildSnapshot(fullXml, csv);
  assert.equal(s.phase, 'complete'); assert.equal(allContestsReported(s.contests), true);
  assert.equal(collectionPolicy(s, afterClose).state, 'complete');
  assert.equal(collectionPolicy(s, afterClose).nextCheckAt, null);
  assert.equal(refreshIsDue(s, afterClose + 30 * 86_400_000), false);
  assert.ok(s.contests.every(c => c.units.every(u => u.status === 'reported')));
  const restored = JSON.parse(JSON.stringify(s)) as Snapshot;
  assert.equal(refreshIsDue(restored, afterClose + 365 * 86_400_000), false);
});
test('inconsistent reporting counts across candidates are rejected before completion can be declared', async () => {
  await assert.rejects(buildSnapshot(xml.replace('<PrecReported>0</PrecReported>', '<PrecReported>1</PrecReported>'), csv), /Inconsistent reporting counts/);
});
