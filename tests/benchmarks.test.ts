import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot } from '../lib/election/adapter.ts';
import { baselineFor, benchmarkOptions, buildComparisons, buildSpecialComparisons, currentTarget, summarizeComparisons, POSITIONS, comparisonColor, type Benchmarks } from '../lib/election/benchmarks.ts';
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

test('archived school races reconcile every candidate and preserve special reporting units', async () => {
  const { makeArchiveSnapshot } = await import('../lib/election/archives.ts');
  for (const school of history.school) {
    const snapshot = makeArchiveSnapshot(`school-${school.year}`, history, seed)!;
    assert.equal(snapshot.electionId, school.date); assert.equal(snapshot.contests.length, 1);
    assert.equal(snapshot.generatedAt, ''); assert.equal(snapshot.fetchedAt, '');
    const board = snapshot.contests[0];
    assert.equal(board.totalVotes, board.choices.reduce((n, c) => n + c.votes, 0));
    assert.ok(board.units.some(u => u.id === 'ABSENTEE' && !u.geographic));
    for (const c of board.choices) assert.equal(c.votes, board.units.reduce((n, u) => n + u.votes[c.id], 0));
    const options = benchmarkOptions(board, history, school.date);
    assert.ok(options.length >= 3); assert.ok(options.every(o => o.kind === 'school' && o.year !== school.year));
    if (school.year === '2025' || school.year === '2023') assert.equal(options[0].year, '2024');
    const rows = buildComparisons(board, history, options[0], 'first', school.date);
    assert.ok(summarizeComparisons(rows).matched >= 35); assert.ok(summarizeComparisons(rows).delta != null);
    const reverse = buildComparisons(board, history, options[0], 'second', school.date);
    const pid = Object.keys(rows).find(id => rows[id].delta != null)!;
    near(rows[pid].current! + reverse[pid].current!, 1); near(rows[pid].delta!, -reverse[pid].delta!);
    assert.equal(rows.ABSENTEE.delta, null);
  }
});
test('2023 uses certified PDF votes and verified slate membership, not conflicting legacy cached metadata', () => {
  const school = history.school.find(s => s.year === '2023')!;
  assert.ok(school.candidates.progressive.includes('DOUG ZIEGEMEIER')); assert.ok(!school.candidates.progressive.includes('ANDREW FLETT'));
  assert.equal(school.boundaryMatch, false); assert.deepEqual(school.units['213'], [255, 741]);
  assert.equal(school.archive.totals[school.archive.candidates.indexOf('JANE PUSZKAR')], 9023);
  assert.ok(school.archive.units['CENTRAL 2']);
});
test('archived general races retain only their explicitly labeled D/R choices and compare across elections', async () => {
  const { makeArchiveSnapshot } = await import('../lib/election/archives.ts');
  const snapshot = makeArchiveSnapshot('general-2024', history, seed)!;
  assert.equal(snapshot.contests.length, 18);
  for (const c of snapshot.contests) {
    assert.equal(c.choices.length, 2); assert.ok(c.choices.every(x => x.name && x.party));
    for (const x of c.choices) assert.equal(x.votes, c.units.reduce((n, u) => n + u.votes[x.id], 0));
    assert.ok(benchmarkOptions(c, history, snapshot.date).every(o => o.year !== '2024'));
  }
  const house = snapshot.contests.find(c => c.sourceName === 'US REPRESENTATIVE DISTRICT 2')!;
  const option = benchmarkOptions(house, history, snapshot.date).find(o => o.kind === 'office')!;
  assert.equal(option.year, '2022');
  assert.ok(summarizeComparisons(buildComparisons(house, history, option, 'first', snapshot.date)).matched >= 30);
  assert.equal(makeArchiveSnapshot('unknown-year', history, seed), null);
});

test('non-geographic general results compare only matching historical accounting units', () => {
  const house = seed.contests.find(c => c.sourceName === 'US REPRESENTATIVE DISTRICT 3')!;
  const option = benchmarkOptions(house, history).find(o => o.id === 'office-2024')!;
  const rows = buildSpecialComparisons(house, history, option, 'first');
  const race = history.general.find(g => g.year === '2024')!.races.find(r => r.name === house.sourceName)!;
  for (const unit of house.units.filter(u => !u.geographic)) {
    assert.ok(rows[unit.id]);
    const pair = race.allUnits[unit.id];
    if (pair && pair[0] + pair[1] > 0) near(rows[unit.id].baseline, pair[0] / (pair[0] + pair[1]));
    assert.equal(rows[unit.id].current, null, 'No swing can be invented from the zero report');
    assert.equal(buildComparisons(house, history, option, 'first')[unit.id].baseline, null, 'Mapped comparison remains geographic only');
  }
});

test('historical school-board absentee share uses verified slate candidate selections', () => {
  const option = benchmarkOptions(h, history).find(o => o.id === 'school-2025')!;
  const row = buildSpecialComparisons(h, history, option, 'first').ABSENTEE;
  const school = history.school.find(s => s.year === '2025')!;
  const values = school.archive.units.ABSENTEE;
  const sum = (names: string[]) => school.archive.candidates.reduce((n, name, i) => n + (names.includes(name) ? values[i] : 0), 0);
  const progressive = sum(school.candidates.progressive);
  const conservative = sum(school.candidates.conservative);
  near(row.baseline, progressive / (progressive + conservative));
  assert.equal(row.current, null);
  assert.equal(row.delta, null);
  assert.equal(buildComparisons(h, history, option, 'first').ABSENTEE.baseline, null);
});
