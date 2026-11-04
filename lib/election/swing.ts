import type { Contest } from './types.ts';
import { baselineFor, type Benchmarks, type BenchmarkOption } from './benchmarks.ts';

export type SwingPoint = {
  id: string;
  delta: number | null;
  current: number | null;
  baseline: number | null;
  races: number;
  votes: number;
};
export const SWING_ALL = 'all';
const democratic = (contest: Contest) => contest.choices.find(c => c.party?.includes('DEMOCRATIC'));
const republican = (contest: Contest) => contest.choices.find(c => c.party?.includes('REPUBLICAN'));
export function swingEligibleRaces(contests: Contest[]) {
  return contests.filter(c => c.type === 'candidate' && c.voteFor === 1
    && democratic(c) && republican(c) && c.units.some(u => u.geographic));
}
/**
 * Per precinct: compute 2026 D/(D+R) for each contested race with published votes.
 * Baseline: same-office 2024 D/R if that exact office is in the audited catalog;
 * otherwise the 2024 precinct's equal-race-weight D/R average. An "all" arrow
 * is an arithmetic mean of *race-level swings*, not a pooled vote share.
 * Never count special reporting units on the map or infer district electorates
 * from overlapping precinct polygons.
 */
export function calculateSwingPoints(contests: Contest[], history: Benchmarks, raceId = SWING_ALL): SwingPoint[] {
  const general = history.general.find(g => g.year === '2024');
  if (!general) return [];
  const candidates = swingEligibleRaces(contests).filter(c => raceId === SWING_ALL || c.id === raceId);
  const entries = new Map<string, { sum: number; current: number; baseline: number; races: number; votes: number }>();
  const names = new Set(general.races.map(r => r.name.replace(/[^A-Z0-9]/g, '')));
  for (const contest of candidates) {
    const d = democratic(contest)!;
    const r = republican(contest)!;
    const sameOffice = names.has(contest.sourceName.replace(/[^A-Z0-9]/g, ''));
    const option: BenchmarkOption = { id: 'swing-2024', label: '2024 baseline', kind: sameOffice ? 'office' : 'average', year: '2024', sourceName: contest.sourceName };
    for (const unit of contest.units) {
      if (!unit.geographic) continue;
      const countD = unit.votes[d.id] ?? 0, countR = unit.votes[r.id] ?? 0, votes = countD + countR;
      if (votes <= 0) continue;
      const baseline = baselineFor(history, option, unit.id, 'first').share;
      if (baseline == null) continue;
      const current = countD / votes, delta = (current - baseline) * 100;
      const prev = entries.get(unit.id) ?? { sum: 0, current: 0, baseline: 0, races: 0, votes: 0 };
      prev.sum += delta; prev.current += current; prev.baseline += baseline; prev.races++; prev.votes += votes;
      entries.set(unit.id, prev);
    }
  }
  return [...entries].map(([id, v]) => ({
    id, delta: v.sum / v.races, current: v.current / v.races,
    baseline: v.baseline / v.races, races: v.races, votes: v.votes,
  })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
export function swingDirection(delta: number | null) {
  if (delta == null || Math.abs(delta) < 0.05) return 'neutral' as const;
  return delta > 0 ? 'democratic' as const : 'republican' as const;
}
