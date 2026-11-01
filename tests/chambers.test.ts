import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAMBERS, chamberRaces, chamberUnits, chamberMapColor } from '../lib/election/chambers.ts';
import { buildComparisons, type Benchmarks } from '../lib/election/benchmarks.ts';
import { makeArchiveSnapshot } from '../lib/election/archives.ts';
import type { Snapshot } from '../lib/election/types.ts';
const seed = JSON.parse(readFileSync(new URL('../lib/election/seed.json', import.meta.url), 'utf8')) as Snapshot;
const history = JSON.parse(readFileSync(new URL('../public/data/historical-benchmarks.json', import.meta.url), 'utf8')) as Benchmarks;

test('chambers include every matching race without mixing state and federal offices', () => {
  const expected = { 'state-house': 11, 'state-senate': 2, 'us-house': 2 };
  for (const group of CHAMBERS) {
    const races = chamberRaces(seed.contests, group.id); assert.equal(races.length, expected[group.id]);
    assert.ok(races.every(c => group.match.test(c.sourceName)));
    assert.equal(new Set(races.map(c => c.id)).size, races.length);
  }
});
test('published precinct membership identifies splits while preserving separate district electorates', () => {
  const expected = { 'state-house': [115, 31], 'state-senate': [68, 3], 'us-house': [115, 4] };
  for (const group of CHAMBERS) {
    const races = chamberRaces(seed.contests, group.id); const units = chamberUnits(races); const mapped = units.filter(u => u.geographic);
    assert.equal(mapped.length, expected[group.id][0]); assert.equal(mapped.filter(u => u.split).length, expected[group.id][1]);
    for (const contest of races) for (const unit of contest.units) {
      const joined = units.find(u => u.id === unit.id)!.races.filter(r => r.contest.id === contest.id);
      assert.equal(joined.length, 1); assert.equal(joined[0].unit, unit); // Original counts/status retained, never pooled.
    }
    const absentee = units.find(u => u.id === 'ABSENTEE')!; assert.equal(absentee.geographic, false); assert.equal(absentee.split, false); assert.equal(absentee.races.length, races.length);
  }
});
test('split precincts never imply a shared leader, reporting status or averaged swing', () => {
  const races = structuredClone(chamberRaces(seed.contests, 'state-senate')); const a = races[0].units.find(u => u.id === '204')!, b = races[1].units.find(u => u.id === '204')!;
  a.totalVotes = 100; a.votes = { [races[0].choices[0].id]: 90, [races[0].choices[1].id]: 10 }; a.status = 'reported';
  b.totalVotes = 20; b.votes = { [races[1].choices[0].id]: 1, [races[1].choices[1].id]: 19 }; b.status = 'partial';
  const unit = chamberUnits(races).find(u => u.id === '204')!; assert.equal(unit.split, true);
  for (const mode of ['district', 'margin', 'reporting', 'baseline', 'variance'] as const) assert.equal(chamberMapColor(unit, races, mode, {}, 'hatch'), 'hatch');
  assert.deepEqual(unit.races.map(r => r.unit.status), ['reported', 'partial']); assert.deepEqual(unit.races.map(r => r.unit.totalVotes), [100, 20]);
  assert.equal('totalVotes' in unit, false); assert.equal('votes' in unit, false);
});
test('a zero-report group has no invented leader color; excluded senate areas stay outside the view', () => {
  const races = chamberRaces(seed.contests, 'state-senate'); const units = chamberUnits(races); const single = units.find(u => u.geographic && !u.split)!;
  assert.equal(chamberMapColor(single, races, 'margin', {}), '#c7d2d9'); assert.equal(chamberMapColor(undefined, races, 'district', {}), '#e8e8e5');
  assert.notEqual(chamberMapColor(single, races, 'district', {}), '#c7d2d9'); // District identity is available before votes.
});
test('archived group comparisons stay separate by district and by reporting unit', () => {
  const snapshot = makeArchiveSnapshot('general-2024', history, seed)!; const races = chamberRaces(snapshot.contests, 'us-house');
  const rows = Object.fromEntries(races.map(c => [c.id, buildComparisons(c, history, { id: 'office-2022', label: '', kind: 'office', year: '2022', sourceName: c.sourceName }, 'first', snapshot.date)]));
  const units = chamberUnits(races); const split = units.find(u => u.id === '207')!; assert.equal(split.split, true);
  for (const { contest, unit } of split.races) {
    const historicalRace = history.general.find(g => g.year === '2022')!.races.find(r => r.name === contest.sourceName)!;
    const pair = historicalRace.units[unit.id];
    const available = pair && pair[0] + pair[1] > 0;
    assert.deepEqual(rows[contest.id][unit.id].races, available ? [contest.sourceName] : []);
    if (available) assert.ok(rows[contest.id][unit.id].delta != null);
    else { assert.equal(rows[contest.id][unit.id].baseline, null); assert.equal(rows[contest.id][unit.id].delta, null); }
    assert.equal(rows[contest.id].ABSENTEE.delta, null);
  }
  assert.equal(chamberMapColor(split, races, 'variance', rows, 'split'), 'split');
});
test('ambiguous duplicate district/unit entries are rejected', () => {
  const race = structuredClone(chamberRaces(seed.contests, 'us-house')[0]); race.units.push(race.units[0]);
  assert.throws(() => chamberUnits([race]), /Duplicate district/);
});
