import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot, parseCSV, parseUnitStatuses } from '../lib/election/adapter.ts';
import { thresholdStatus, unitLabel } from '../lib/election/presentation.ts';

const file = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const xml = file('summary-33.xml'), csv = file('precincts-33.csv');
const zero = () => buildSnapshot(xml, csv, { expectedContests: 50, statuses: parseUnitStatuses(file('report-33.html')) });

test('November real source files reconcile all 50 contests and preserve each special unit', async () => {
  const s = await zero(); assert.equal(s.contests.length, 50); assert.equal(s.geographicUnits, 115); assert.equal(s.reportingUnits, 118); assert.equal(s.phase, 'awaiting-results'); assert.equal(s.turnout, null);
  for (const c of s.contests) { assert.equal(c.totalVotes, 0); assert.equal(c.units.length, c.totalReportingUnits); }
  const h = s.contests.find(c => c.id === '47')!;
  assert.equal(h.geographicUnits, 38); assert.deepEqual(h.units.filter(u => !u.geographic).map(u => u.id), ['ABSENTEE', 'CENTRAL 1']);
  const auditor = s.contests.find(c => c.id === '1')!; assert.equal(auditor.choices[0].name, 'SCOTT FITZPATRICK'); assert.equal(auditor.choices[0].party, 'REPUBLICAN PARTY');
  assert.equal(h.units[0].status, 'not-reported');
});
test('April completed election reconciles 83 contests and all 220 candidate totals', async () => {
  const s = await buildSnapshot(file('summary-31.xml'), file('precincts-31.csv'), { sourceId: '31', expectedContests: 83 });
  assert.equal(s.contests.length, 83); assert.equal(s.contests.reduce((n, c) => n + c.choices.length, 0), 220);
  const rt = s.contests.find(c => c.sourceName === 'ST. CHARLES COUNTY PROPOSITION RT')!;
  assert.equal(rt.choices.find(c => c.name === 'NO')?.votes, 36581); assert.equal(rt.choices.find(c => c.name === 'YES')?.votes, 25317);
});
test('RFC CSV parser preserves commas, escaped quotes and multiline fields', () => {
  assert.deepEqual(parseCSV('\uFEFFa,b\r\n"first, last","a ""quoted""\nname"\r\n'), [['a','b'],['first, last','a "quoted"\nname']]);
  assert.throws(() => parseCSV('a,"truncated'), /unclosed/);
});
test('rejects out-of-sync sources rather than publishing partial results', async () => {
  await assert.rejects(buildSnapshot(xml, csv.replace('"SCOTT FITZPATRICK","0"', '"SCOTT FITZPATRICK","1"')), /out of sync/);
});
test('rejects unknown candidates, missing rows, duplicate rows and negative votes', async () => {
  await assert.rejects(buildSnapshot(xml, csv.replace('"SCOTT FITZPATRICK"', '"UNKNOWN NAME"')), /Unmatched/);
  const lines = csv.split(/\r?\n/); await assert.rejects(buildSnapshot(xml, [...lines.slice(0, 3), ...lines.slice(4)].join('\n')), /Missing candidate/);
  await assert.rejects(buildSnapshot(xml, csv + '\n' + lines[3]), /Duplicate/);
  await assert.rejects(buildSnapshot(xml, csv.replace('"SCOTT FITZPATRICK","0"', '"SCOTT FITZPATRICK","-1"')), /Invalid precinct votes/);
});
test('same-total vote corrections and reporting status changes produce a new hash', async () => {
  const a = await zero();
  const xmlA = xml.replace('<TotalVotes>0</TotalVotes>', '<TotalVotes>5</TotalVotes>');
  const csvA = csv.replace('"SCOTT FITZPATRICK","0"', '"SCOTT FITZPATRICK","5"');
  const b = await buildSnapshot(xmlA, csvA);
  const xmlB = xml.replace(/(<ContestantName>QUENTIN WILSON<\/ContestantName>[\s\S]*?<TotalVotes>)0/, '$15');
  const csvB = csv.replace('"QUENTIN WILSON","0"', '"QUENTIN WILSON","5"');
  const c = await buildSnapshot(xmlB, csvB); assert.equal(b.contests[0].totalVotes, c.contests[0].totalVotes); assert.notEqual(b.dataHash, c.dataHash);
  const d = await buildSnapshot(xml, csv, { statuses: { '101': 'reported' } }); assert.notEqual(a.dataHash, d.dataHash);
  assert.equal(unitLabel(d.contests[0].units.find(u => u.id === '101')!), 'Reported · zero valid votes');
});
test('FHSD H uses exact four-sevenths while O requires strictly more than half', async () => {
  const s = await zero(); const h = s.contests.find(c => c.id === '47')!; const o = s.contests.find(c => c.id === '48')!;
  assert.equal(thresholdStatus(h), null);
  h.totalVotes = 7; h.choices.find(c => c.name === 'YES')!.votes = 4; assert.equal(thresholdStatus(h), true);
  h.totalVotes = 10000; h.choices.find(c => c.name === 'YES')!.votes = 5714; assert.equal(thresholdStatus(h), false);
  o.totalVotes = 100; o.choices.find(c => c.name === 'YES')!.votes = 50; assert.equal(thresholdStatus(o), false);
  o.choices.find(c => c.name === 'YES')!.votes = 51; assert.equal(thresholdStatus(o), true);
});
test('rejects wrong election and a truncated/malformed feed', async () => {
  await assert.rejects(buildSnapshot(xml, csv, { sourceId: '31' }), /election ID/);
  await assert.rejects(buildSnapshot(xml.slice(0, 400), csv), /Invalid county/);
});
test('every November geographic unit matches the election-specific polygon file', async () => {
  const s = await zero(); const geo = JSON.parse(readFileSync(new URL('../public/data/precincts.geojson', import.meta.url), 'utf8'));
  const ids = new Set(s.contests.flatMap(c => c.units.filter(u => u.geographic).map(u => u.id)));
  const polygons = new Set(geo.features.map((f: { properties: { DIST_NUM: string } }) => f.properties.DIST_NUM));
  assert.equal(polygons.size, 115); assert.deepEqual([...ids].sort(), [...polygons].sort());
});
