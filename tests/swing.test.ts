import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Benchmarks } from '../lib/election/benchmarks.ts';
import type { Snapshot } from '../lib/election/types.ts';
import { baselineFor } from '../lib/election/benchmarks.ts';
import { calculateSwingPoints, swingDirection, swingEligibleRaces, SWING_ALL } from '../lib/election/swing.ts';
const history = JSON.parse(readFileSync(new URL('../public/data/historical-benchmarks.json', import.meta.url), 'utf8')) as Benchmarks;
const snapshot = JSON.parse(readFileSync(new URL('../lib/election/seed.json', import.meta.url), 'utf8')) as Snapshot;

test('zero report never invents arrows or district-wide swing', () => {
  assert.deepEqual(calculateSwingPoints(snapshot.contests, history), []);
  assert.ok(swingEligibleRaces(snapshot.contests).every(c => c.choices.some(x => x.party?.includes('DEMOCRATIC')) && c.choices.some(x => x.party?.includes('REPUBLICAN'))));
  assert.equal(swingDirection(null), 'neutral');
});
test('a published precinct computes exact selected race swing and no absentee arrow', () => {
  const c = structuredClone(swingEligibleRaces(snapshot.contests).find(c => c.sourceName === 'US REPRESENTATIVE DISTRICT 2')!);
  assert.ok(c);
  const pid = c.units.find(u => u.geographic)?.id!;
  const unit = c.units.find(u => u.id === pid)!;
  const d = c.choices.find(x => x.party?.includes('DEMOCRATIC'))!;
  const r = c.choices.find(x => x.party?.includes('REPUBLICAN'))!;
  unit.votes[d.id] = 65; unit.votes[r.id] = 35; unit.totalVotes = 100;
  const points = calculateSwingPoints([c], history, c.id);
  const point = points.find(p => p.id === pid)!;
  assert.ok(point);
  const baseline = baselineFor(history, { id: 'same', label: 'same', year: '2024', kind: 'office', sourceName: c.sourceName }, pid, 'first').share!;
  assert.ok(Math.abs(point.delta! - (65 - baseline * 100)) < 1e-8);
  assert.equal(point.races, 1);
  assert.equal(point.votes, 100);
  assert.ok(points.every(p => /^\d+$/.test(p.id)));
  assert.equal(calculateSwingPoints([c], history, 'not-a-race').length, 0);
});
test('all-races arrow is an equal-weight average of available race-level swings, not pooled ballots', () => {
  const first = structuredClone(swingEligibleRaces(snapshot.contests)[0]);
  const second = structuredClone(swingEligibleRaces(snapshot.contests)[1]);
  const common = first.units.find(u => u.geographic && second.units.some(v => v.geographic && v.id === u.id));
  assert.ok(common);
  const pid = common.id;
  for (const [c, dVotes, rVotes] of [[first, 9, 1], [second, 10, 90]] as const) {
    const u = c.units.find(x => x.id === pid)!;
    u.votes[c.choices.find(x => x.party?.includes('DEMOCRATIC'))!.id] = dVotes;
    u.votes[c.choices.find(x => x.party?.includes('REPUBLICAN'))!.id] = rVotes;
  }
  const result = calculateSwingPoints([first, second], history, SWING_ALL).find(p => p.id === pid)!;
  const a = calculateSwingPoints([first], history, first.id).find(p => p.id === pid)!;
  const b = calculateSwingPoints([second], history, second.id).find(p => p.id === pid)!;
  assert.ok(a && b && result);
  assert.ok(Math.abs(result.delta! - (a.delta! + b.delta!) / 2) < 1e-8);
  assert.equal(result.races, 2);
  assert.equal(result.votes, 110);
  assert.notEqual(result.current, 19 / 110);
  assert.equal(swingDirection(0.2), 'democratic');
  assert.equal(swingDirection(-0.2), 'republican');
});
