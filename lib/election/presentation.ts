import type { Choice, Contest, ResultUnit } from './types.ts';

export const formatNumber = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('en-US');
export const share = (votes: number, total: number) => total > 0 ? `${(votes / total * 100).toFixed(1)}%` : '—';
export function leader(contest: Contest, unit?: ResultUnit | null) {
  const total = unit ? unit.totalVotes : contest.totalVotes; if (!total) return null;
  const sorted = contest.choices.map(c => ({ ...c, votes: unit ? unit.votes[c.id] ?? 0 : c.votes })).sort((a, b) => b.votes - a.votes);
  if (sorted.length < 2 || sorted[0].votes === sorted[1].votes) return { choice: sorted[0], tie: true, margin: 0 };
  return { choice: sorted[0], tie: false, margin: (sorted[0].votes - sorted[1].votes) / total };
}
export function thresholdStatus(contest: Contest) {
  if (!contest.approvalRule || !contest.totalVotes) return null;
  const yes = contest.choices.find(c => c.name.toUpperCase() === 'YES')?.votes ?? 0;
  const { numerator, denominator, strict } = contest.approvalRule;
  return strict ? yes * denominator > contest.totalVotes * numerator : yes * denominator >= contest.totalVotes * numerator;
}
export function unitLabel(unit: ResultUnit | null) {
  if (!unit) return 'Outside this contest';
  if (unit.status === 'reported') return unit.totalVotes ? 'Reported' : 'Reported · zero valid votes';
  if (unit.status === 'partial') return 'Partially reported';
  if (unit.totalVotes > 0) return 'Votes published';
  return unit.status === 'not-reported' ? 'Not yet reported' : 'No votes published';
}
export function mapColor(contest: Contest, unit: ResultUnit | null, mode: 'margin' | 'reporting') {
  if (!unit) return '#e8e8e5';
  if (mode === 'reporting') return unit.status === 'reported' ? '#238b72' : unit.status === 'partial' ? '#d8a13d' : unit.totalVotes ? '#6eaaa0' : '#c7d2d9';
  const winner = leader(contest, unit); if (!winner) return '#c7d2d9'; if (winner.tie) return '#f1ede3';
  const hex = winner.choice.color.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const t = .35 + .65 * Math.min(winner.margin / .3, 1);
  return `rgb(${c.map((v, i) => Math.round([245, 245, 241][i] + (v - [245, 245, 241][i]) * t)).join(',')})`;
}
export function shortName(choice: Choice) { return choice.name.toUpperCase() === 'YES' ? 'Yes' : choice.name.toUpperCase() === 'NO' ? 'No' : choice.name.split(' ').slice(-1)[0]; }
