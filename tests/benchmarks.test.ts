import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot } from '../lib/election/adapter.ts';
import { baselineFor, benchmarkOptions, buildComparisons, currentTarget, summarizeComparisons, POSITIONS, comparisonColor, type Benchmarks } from '../lib/election/benchmarks.ts';
import type { Contest, Snapshot } from '../lib/election/types.ts';
const history = JSON.parse(readFileSync(new URL('../public/data/historical-benchmarks.json', import.meta.url), 'utf8')) as Benchmarks;
const seed = JSON.parse(readFileSync(new URL('../lib/election/seed.json', import.meta.url), 'utf8')) as Snapshot;
const h = seed.contests.find(c => c.id === '47')!;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('zero reports retain historical shares without inventing variance or absentee geography', () => {
  const option = benchmarkOptions(h, history)[0]; assert.equal(option.id, 'school-2026');
  const rows = buildComparisons(h, history, option, 'first'); const eligible = Object.values(rows).filter(r => r.baseline != null);
  assert.ok(eligible.length >= 35); assert.ok(eligible.every(r => r.current == null && r.delta == null));
  for (const unit of h.units.filter(u => !u.geographic)) assert.equal(rows[unit.id].baseline, null);
  assert.equal(summarizeComparisons(rows).delta, null);
  assert.equal(comparisonColor(h.units.find(u => u.geographic)!, eligible[0], 'variance'), '#c7d2d9');
});
test('slates use official candidate selections, equal-sized groups, excluding write-ins', async () => {
  const april = await buildSnapshot(fixture('summary-31.xml'), fixture('precincts-31.csv'), { sourceId: '31', electionId: '2026-04-07' });
  const board = april.contests.find(c => c.sourceName === 'FRANCIS HOWELL R-III SCHOOL BOARD MEMBER')!;
  const source = history.school.find(s => s.year === '2026')!;
  for (const unit of board.units.filter(u => u.geographic)) {
    const pair = source.units[unit.id]; assert.ok(pair, unit.id);
    const selections = (names: string[]) => board.choices.filter(c => names.includes(c.name)).reduce((n, c) => n + unit.votes[c.id], 0);
    assert.deepEqual(pair, [selections(source.candidates.progressive), selections(source.candidates.conservative)]);
    assert.equal(source.candidates.progressive.length, source.candidates.conservative.length);
  }
});
test('race averages equally weight shares, not turnout; zero/missing race cells are excluded', () => {
  const general = history.general[0]; const pid = '101';
  const included = general.races.filter(r => r.units[pid]?.reduce((a, b) => a + b, 0));
  const expected = included.reduce((n, r) => n + r.units[pid][0] / (r.units[pid][0] + r.units[pid][1]), 0) / included.length;
  const first = baselineFor(history, { id: 'average-2024', label: '', kind: 'average', year: '2024' }, pid, 'first');
  const second = baselineFor(history, { id: 'average-2024', label: '', kind: 'average', year: '2024' }, pid, 'second');
  near(first.share, expected); near(first.share! + second.share!, 1); assert.equal(first.races.length, included.length);
});
test('official statewide endorsements orient No/Yes correctly and neutral local props do not acquire parties', () => {
  assert.equal(Object.keys(POSITIONS).length, 5);
  for (const [name, position] of Object.entries(POSITIONS)) {
    const c = seed.contests.find(c => c.sourceName === name)!; assert.ok(c);
    const option = benchmarkOptions(c, history).find(o => o.id === 'average-2024')!;
    for (const side of ['first', 'second'] as const) {
      const target = currentTarget(c, option, side);
      assert.equal(c.choices.find(x => x.id === target.numerator[0])!.name, position[side === 'first' ? 'democratic' : 'republican']);
    }
  }
  const local = seed.contests.find(c => c.id === '45')!; assert.equal(POSITIONS[local.sourceName], undefined);
  assert.equal(currentTarget(local, benchmarkOptions(local, history)[0], 'second').label, 'Yes share');
});
test('variance is percentage-point share difference and summary uses only matched current precinct votes', () => {
  const c = structuredClone(h); const option = benchmarkOptions(c, history)[0];
  const unit = c.units.find(u => history.school[0].units[u.id])!; const yes = c.choices.find(x => x.name === 'YES')!, no = c.choices.find(x => x.name === 'NO')!;
  unit.votes = { [yes.id]: 60, [no.id]: 40 }; unit.totalVotes = 100; unit.status = 'partial';
  const rows = buildComparisons(c, history, option, 'first'); const row = rows[unit.id];
  near(row.current, .6); near(row.delta, (.6 - row.baseline!) * 100);
  const summary = summarizeComparisons(rows); assert.equal(summary.matched, 1); assert.equal(summary.votes, 100); near(summary.delta, row.delta!);
  const reversed = buildComparisons(c, history, option, 'second')[unit.id]; near(reversed.current, .6); near(reversed.baseline, 1 - row.baseline!);
});
test('same-office baselines only include that office; uncontested current races show baseline without a delta', () => {
  const auditor = seed.contests.find(c => c.sourceName === 'STATE AUDITOR')!;
  const option = benchmarkOptions(auditor, history).find(o => o.id === 'office-2022')!; assert.ok(option);
  const rows = buildComparisons(auditor, history, option, 'first'); assert.deepEqual(rows['101'].races, ['STATE AUDITOR']);
  const uncontested = structuredClone(auditor); uncontested.choices = uncontested.choices.filter(c => c.party?.includes('REPUBLICAN'));
  for (const u of uncontested.units) { u.totalVotes = 100; for (const id of Object.keys(u.votes)) u.votes[id] = 100; }
  assert.ok(Object.values(buildComparisons(uncontested, history, option, 'first')).every(r => r.current == null && r.delta == null));
});
test('audited catalog has only geographic integer counts and certified check totals', () => {
  assert.equal(history.general[0].races.length, 18); assert.equal(history.general[1].races.length, 15);
  const president = history.general[0].races.find(r => r.name === 'PRESIDENT AND VICE PRESIDENT')!;
  assert.deepEqual(president.totals, [92226, 130588]); assert.deepEqual(president.units['101'], [24, 61]);
  const auditor = history.general[1].races.find(r => r.name === 'STATE AUDITOR')!;
  assert.deepEqual(auditor.units['101'], [35, 47]);
  for (const g of history.general) for (const r of g.races) for (const [id, pair] of Object.entries(r.units)) {
    assert.match(id, /^\d{3}$/); assert.ok(pair.every(v => Number.isSafeInteger(v) && v >= 0));
  }
});
