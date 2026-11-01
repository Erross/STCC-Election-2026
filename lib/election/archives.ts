import type { Benchmarks } from './benchmarks.ts';
import type { Choice, Contest, Snapshot } from './types.ts';
export const LIVE_ELECTION = '2026-11-03';
export function archiveOptions(history: Benchmarks) {
  return [
    ...history.school.map(s => ({ id: `school-${s.year}`, label: `April ${s.year} · FH school board`, date: s.date, source: s.source, approximate: !s.boundaryMatch, kind: 'school' as const })),
    ...history.general.map(g => ({ id: `general-${g.year}`, label: `November ${g.year} · verified D/R races`, date: g.year === '2024' ? '2024-11-05' : '2022-11-08', source: g.source, approximate: !g.boundaryMatch, kind: 'general' as const })),
  ];
}
const pretty = (value: string) => value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/^Us /, 'U.S. ');
export function makeArchiveSnapshot(id: string, history: Benchmarks, template: Snapshot): Snapshot | null {
  const entry = archiveOptions(history).find(e => e.id === id); if (!entry) return null;
  let contests: Contest[];
  if (entry.kind === 'school') {
    const school = history.school.find(s => `school-${s.year}` === id)!; const archive = school.archive;
    const choices: Choice[] = archive.candidates.map((name, i) => ({ id: String(i), name, party: null, votes: archive.totals[i], writeIn: /^WRITE/.test(name), color: school.candidates.progressive.includes(name) ? '#3b73b7' : school.candidates.conservative.includes(name) ? '#c25155' : '#89919b' }));
    const units = Object.entries(archive.units).map(([pid, values]) => ({ id: pid, geographic: /^\d+$/.test(pid), totalVotes: values.reduce((a, b) => a + b, 0), votes: Object.fromEntries(values.map((v, i) => [String(i), v])), status: 'reported' as const, turnout: null }));
    units.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    contests = [{ id: 'schoolboard', sourceName: 'FRANCIS HOWELL R-III SCHOOL BOARD MEMBER', title: 'School Board', jurisdiction: 'Francis Howell School District', category: 'Local measures', type: 'candidate', countyOnly: false, voteFor: archive.voteFor, positions: archive.voteFor, totalVotes: archive.totals.reduce((a, b) => a + b, 0), reported: units.length, totalReportingUnits: units.length, geographicUnits: units.filter(u => u.geographic).length, choices, units, approvalRule: null }];
  } else {
    const general = history.general.find(g => `general-${g.year}` === id)!;
    contests = general.races.map((race, index) => {
      const original = template.contests.find(c => c.sourceName === race.name);
      const choices: Choice[] = race.candidates.map((name, i) => ({ id: String(i), name, party: i === 0 ? 'DEMOCRATIC PARTY' : 'REPUBLICAN PARTY', votes: race.totals[i], color: i === 0 ? '#3b73b7' : '#c25155', writeIn: false }));
      const units = Object.entries(race.allUnits).map(([pid, pair]) => ({ id: pid, geographic: /^\d+$/.test(pid), totalVotes: pair[0] + pair[1], votes: { '0': pair[0], '1': pair[1] }, status: 'reported' as const, turnout: null }));
      units.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const category = original?.category ?? (/^STATE (REPRESENTATIVE|SENATOR)/.test(race.name) ? 'State legislature' : /^US |PRESIDENT/.test(race.name) ? 'Federal' : /GOVERNOR|SECRETARY|TREASURER/.test(race.name) ? 'Statewide' : 'County');
      return { id: `archive-${index}`, sourceName: race.name, title: original?.title ?? pretty(race.name), jurisdiction: original?.jurisdiction ?? (category === 'County' ? 'St. Charles County' : 'Missouri'), category, type: 'candidate' as const, countyOnly: original?.countyOnly ?? category !== 'County', voteFor: 1, positions: 1, totalVotes: race.totals[0] + race.totals[1], reported: units.length, totalReportingUnits: units.length, geographicUnits: units.filter(u => u.geographic).length, choices, units, approvalRule: null };
    });
  }
  const units = new Set(contests.flatMap(c => c.units.map(u => u.id)));
  return { ...template, electionId: entry.date, sourceElectionId: id, title: entry.label, date: entry.date, generatedAt: `${entry.date}T12:00:00Z`, fetchedAt: `${entry.date}T12:00:00Z`, dataHash: id, phase: 'complete', totalBallots: null, registeredVoters: null, turnout: null, geographicUnits: [...units].filter(u => /^\d+$/.test(u)).length, reportingUnits: units.size, contests };
}
