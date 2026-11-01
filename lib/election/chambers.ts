import type { Contest, ResultUnit } from './types.ts';
import type { Comparison } from './benchmarks.ts';
import { comparisonColor } from './benchmarks.ts';
import { mapColor } from './presentation.ts';
export const CHAMBERS = [
  { id: 'state-house', label: 'Missouri House', match: /^STATE REPRESENTATIVE DISTRICT / },
  { id: 'state-senate', label: 'Missouri Senate', match: /^STATE SENATOR DISTRICT / },
  { id: 'us-house', label: 'U.S. House', match: /^US REPRESENTATIVE DISTRICT / },
] as const;
export type ChamberId = typeof CHAMBERS[number]['id'];
export type ChamberMapMode = 'district' | 'margin' | 'reporting' | 'baseline' | 'variance';
export type DistrictUnit = { contest: Contest; unit: ResultUnit };
export type ChamberPrecinct = { id: string; geographic: boolean; races: DistrictUnit[]; split: boolean };
export type RaceComparisons = Record<string, Record<string, Comparison>>;
export const districtNumber = (c: Contest) => c.sourceName.match(/DISTRICT (\d+)$/)?.[1] ?? c.id;
export const chamberRaces = (contests: Contest[], id: ChamberId) => contests.filter(c => CHAMBERS.find(g => g.id === id)!.match.test(c.sourceName)).sort((a, b) => Number(districtNumber(a)) - Number(districtNumber(b)));
export function chamberUnits(races: Contest[]): ChamberPrecinct[] {
  const units = new Map<string, ChamberPrecinct>();
  for (const contest of races) for (const unit of contest.units) {
    let item = units.get(unit.id); if (!item) { item = { id: unit.id, geographic: unit.geographic, races: [], split: false }; units.set(unit.id, item); }
    if (item.races.some(r => r.contest.id === contest.id)) throw new Error('Duplicate district/reporting-unit entry');
    if (item.geographic !== unit.geographic) throw new Error('Inconsistent reporting-unit geography');
    item.races.push({ contest, unit }); item.split = item.geographic && item.races.length > 1;
  }
  return [...units.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
const DISTRICT_COLORS = ['#4477aa', '#228833', '#dd9944', '#bb5566', '#55aaaa', '#997755', '#88aa33', '#447744', '#aa7744', '#6688bb', '#aa6677'];
export const districtColor = (races: Contest[], id: string) => DISTRICT_COLORS[Math.max(0, races.findIndex(r => r.id === id)) % DISTRICT_COLORS.length];
/** A polygon can represent several district electorates. Never pool or choose a winner across them. */
export function chamberMapColor(item: ChamberPrecinct | undefined, races: Contest[], mode: ChamberMapMode, comparisons: RaceComparisons, splitPattern = '#8d839d') {
  if (!item || !item.geographic) return '#e8e8e5';
  if (item.split) return splitPattern;
  const { contest, unit } = item.races[0];
  if (mode === 'district') return districtColor(races, contest.id);
  if (mode === 'baseline' || mode === 'variance') return comparisonColor(unit, comparisons[contest.id]?.[unit.id], mode);
  const choices = mode === 'margin' ? contest.choices.map(c => /DEMOCRATIC|REPUBLICAN/.test(c.party ?? '') ? c : { ...c, color: '#b88a31' }) : contest.choices;
  return mapColor({ ...contest, choices }, unit, mode);
}
