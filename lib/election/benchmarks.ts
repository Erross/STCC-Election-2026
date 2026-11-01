import type { Contest, ResultUnit } from './types.ts';
export type Pair = [number, number]; // Democratic/progressive first; Republican/conservative second.
export type HistoricalRace = { name: string; units: Record<string, Pair>; pages: number[]; totals: Pair };
export type GeneralHistory = { year: string; source: string; sha256: string; boundaryMatch: boolean; races: HistoricalRace[] };
export type SchoolHistory = { year: string; source: string; candidates: { progressive: string[]; conservative: string[] }; units: Record<string, Pair> };
export type Benchmarks = { schemaVersion: 1; general: GeneralHistory[]; school: SchoolHistory[] };
export type BenchmarkOption = { id: string; label: string; kind: 'school' | 'average' | 'office'; year: string; sourceName?: string };
export type Alignment = 'first' | 'second';
export type Comparison = { baseline: number | null; current: number | null; delta: number | null; votes: number; races: string[] };
export type MapMode = 'margin' | 'reporting' | 'baseline' | 'variance';
const DEM_SOURCE = 'https://www.missouridemocrats.org/2026-general-election';
const GOP_SOURCE = 'https://missouri.gop/wp-content/uploads/sites/26/2026/10/Ballot_Guide_Full-2.pdf';
export const PARTY_SOURCES = { democratic: DEM_SOURCE, republican: GOP_SOURCE, checked: '2026-11-01' };
// Explicit 2026 endorsements. A repeated proposition number in another year is a different question.
export const POSITIONS: Record<string, { democratic: 'YES' | 'NO'; republican: 'YES' | 'NO' }> = {
  'CONSTITUTIONAL AMENDMENT NO. 3': { democratic: 'NO', republican: 'YES' },
  'CONSTITUTIONAL AMENDMENT NO. 6': { democratic: 'YES', republican: 'NO' },
  'CONSTITUTIONAL AMENDMENT NO. 7': { democratic: 'NO', republican: 'YES' },
  'CONSTITUTIONAL AMENDMENT NO. 8': { democratic: 'NO', republican: 'YES' },
  'PROPOSITION A': { democratic: 'NO', republican: 'YES' },
};
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isHowellMeasure = (c: Contest) => /^FRANCIS HOWELL R-III PROPOSITION [HO]$/.test(c.sourceName);
export function benchmarkOptions(c: Contest, history: Benchmarks): BenchmarkOption[] {
  const options: BenchmarkOption[] = [];
  if (isHowellMeasure(c)) for (const school of history.school) options.push({ id: `school-${school.year}`, label: `School board ${school.year} · slate share`, kind: 'school', year: school.year });
  for (const general of history.general) {
    const caveat = general.boundaryMatch ? '' : ' · precinct IDs only*';
    if (c.type === 'candidate' && general.races.some(r => norm(r.name) === norm(c.sourceName))) options.push({ id: `office-${general.year}`, label: `${general.year} same office${caveat}`, kind: 'office', year: general.year, sourceName: c.sourceName });
    options.push({ id: `average-${general.year}`, label: `${general.year} D/R race average${caveat}`, kind: 'average', year: general.year });
  }
  return options;
}
export function baselineFor(history: Benchmarks, option: BenchmarkOption, pid: string, alignment: Alignment): { share: number | null; races: string[] } {
  if (!/^\d+$/.test(pid)) return { share: null, races: [] };
  if (option.kind === 'school') {
    const pair = history.school.find(s => s.year === option.year)?.units[pid];
    const total = pair ? pair[0] + pair[1] : 0;
    return { share: pair && total ? pair[alignment === 'first' ? 0 : 1] / total : null, races: total ? ['FH Forward / FH Families school-board selections'] : [] };
  }
  const all = history.general.find(g => g.year === option.year)?.races ?? [];
  const races = option.kind === 'office' ? all.filter(r => norm(r.name) === norm(option.sourceName ?? '')) : all;
  const valid = races.filter(r => r.units[pid] && r.units[pid][0] + r.units[pid][1] > 0);
  if (!valid.length) return { share: null, races: [] };
  return { share: valid.reduce((sum, r) => { const p = r.units[pid]; return sum + p[alignment === 'first' ? 0 : 1] / (p[0] + p[1]); }, 0) / valid.length, races: valid.map(r => r.name) };
}
export function currentTarget(c: Contest, option: BenchmarkOption, alignment: Alignment) {
  if (c.type === 'candidate') {
    const party = alignment === 'first' ? 'DEMOCRATIC' : 'REPUBLICAN';
    const numerator = c.choices.filter(x => x.party?.includes(party)).map(x => x.id);
    const denominator = c.choices.filter(x => /DEMOCRATIC|REPUBLICAN/.test(x.party ?? '')).map(x => x.id);
    const both = c.choices.some(x => x.party?.includes('DEMOCRATIC')) && c.choices.some(x => x.party?.includes('REPUBLICAN'));
    return { numerator, denominator, label: alignment === 'first' ? 'D share' : 'R share', available: both };
  }
  const position = POSITIONS[c.sourceName];
  const side = option.kind === 'school' || !position ? 'YES' : position[alignment === 'first' ? 'democratic' : 'republican'];
  return { numerator: c.choices.filter(x => x.name.toUpperCase() === side).map(x => x.id), denominator: c.choices.filter(x => /^(YES|NO)$/.test(x.name.toUpperCase())).map(x => x.id), label: `${side === 'YES' ? 'Yes' : 'No'} share`, available: true };
}
export function buildComparisons(c: Contest, history: Benchmarks, option: BenchmarkOption, alignment: Alignment): Record<string, Comparison> {
  const target = currentTarget(c, option, alignment); const result: Record<string, Comparison> = {};
  for (const u of c.units) {
    const b = u.geographic ? baselineFor(history, option, u.id, alignment) : { share: null, races: [] };
    const votes = target.denominator.reduce((n, id) => n + (u.votes[id] ?? 0), 0);
    const current = u.geographic && target.available && votes > 0 ? target.numerator.reduce((n, id) => n + (u.votes[id] ?? 0), 0) / votes : null;
    result[u.id] = { baseline: b.share, current, delta: b.share != null && current != null ? (current - b.share) * 100 : null, votes, races: b.races };
  }
  return result;
}
export function summarizeComparisons(rows: Record<string, Comparison>) {
  const eligible = Object.values(rows).filter(r => r.baseline != null);
  const matched = eligible.filter(r => r.current != null && r.votes > 0);
  const votes = matched.reduce((n, r) => n + r.votes, 0);
  const baseline = votes ? matched.reduce((n, r) => n + r.baseline! * r.votes, 0) / votes : null;
  const current = votes ? matched.reduce((n, r) => n + r.current! * r.votes, 0) / votes : null;
  return { eligible: eligible.length, matched: matched.length, votes, baseline, current, delta: baseline != null && current != null ? (current - baseline) * 100 : null };
}
export const percent = (v: number | null | undefined) => v == null ? '—' : `${(v * 100).toFixed(1)}%`;
export const points = (v: number | null | undefined) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`;
export function comparisonColor(unit: ResultUnit | null, row: Comparison | undefined, mode: 'baseline' | 'variance') {
  if (!unit) return '#e8e8e5';
  const value = mode === 'baseline' ? row?.baseline : row?.delta;
  if (value == null) return '#c7d2d9';
  const signed = mode === 'baseline' ? (value - .5) * 100 : value;
  const color = signed >= 0 ? [20, 119, 114] : [185, 111, 46];
  const strength = Math.min(Math.abs(signed) / 20, 1);
  return `rgb(${color.map((n, i) => Math.round([244, 242, 235][i] + (n - [244, 242, 235][i]) * strength)).join(',')})`;
}
