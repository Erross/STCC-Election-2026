import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ApprovalRule, Category, Choice, Contest, Snapshot, UnitStatus } from './types.ts';
import { allContestsReported } from './policy.ts';

export const SOURCE_BASE = 'https://www.livevoterturnout.com/ENR/stcharlesmoenr/33/';
export const SOURCE_PAGE = `${SOURCE_BASE}en/Index_33.html`;
const FAQ = 'https://www.fhsdschools.org/propoh';
const normalize = (s: unknown) => String(s ?? '').replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
const key = (s: unknown) => normalize(s).toUpperCase();

/** RFC 4180 fields, including BOM, embedded newlines, commas and escaped quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === '') quoted = !quoted;
      else throw new Error('Invalid quote in county CSV');
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v !== '')) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Truncated county CSV: unclosed quoted field');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function integer(value: unknown, label: string) {
  const s = String(value ?? '').trim();
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) throw new Error(`Invalid ${label}`);
  return Number(s);
}
function nullableRate(value: unknown) {
  const s = String(value ?? '').trim(); if (!s || /nan/i.test(s)) return null;
  const n = Number(s.replace('%', '')); return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : null;
}
function pretty(text: string) {
  return text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bR-Iii\b/g, 'R-III').replace(/\bR-Ii\b/g, 'R-II').replace(/\bR-V\b/g, 'R-V').replace(/\bUs\b/g, 'U.S.');
}
function describe(name: string): Pick<Contest, 'title' | 'jurisdiction' | 'category' | 'countyOnly'> {
  if (name.startsWith('FRANCIS HOWELL')) return { title: name.endsWith('MEMBER') ? 'School Board' : pretty(name.match(/PROPOSITION .+$/)?.[0] ?? name), jurisdiction: 'Francis Howell School District', category: 'Local measures', countyOnly: false };
  const local = [['FORT ZUMWALT R-II', 'Fort Zumwalt School District'], ['ORCHARD FARM R-V', 'Orchard Farm School District'], ['CENTRAL COUNTY FIRE AND RESCUE', 'Central County Fire & Rescue'], ['ST. CHARLES AMBULANCE', 'St. Charles County Ambulance District']];
  for (const [prefix, jurisdiction] of local) if (name.startsWith(prefix)) return { title: pretty(name.slice(prefix.length).trim()), jurisdiction, category: 'Local measures', countyOnly: false };
  let category: Category = 'County'; let jurisdiction = 'St. Charles County'; let countyOnly = false;
  if (name.startsWith('US REPRESENTATIVE')) { category = 'Federal'; jurisdiction = 'U.S. House of Representatives'; countyOnly = true; }
  else if (name.startsWith('STATE REPRESENTATIVE') || name.startsWith('STATE SENATOR')) { category = 'State legislature'; jurisdiction = name.startsWith('STATE SENATOR') ? 'Missouri Senate' : 'Missouri House'; countyOnly = true; }
  else if (name === 'STATE AUDITOR') { category = 'Statewide'; jurisdiction = 'Missouri'; countyOnly = true; }
  else if (name.startsWith('CONSTITUTIONAL') || name === 'PROPOSITION A') { category = 'Statewide measures'; jurisdiction = 'Missouri'; countyOnly = true; }
  else if (/JUDGE|RETAIN/.test(name)) { category = 'Judicial'; jurisdiction = name.startsWith('RETAIN') ? 'Missouri judicial retention' : '11th Judicial Circuit'; countyOnly = name.startsWith('RETAIN'); }
  else if (name.startsWith('ST. CHARLES COUNCIL')) { category = 'Municipal'; jurisdiction = 'City of St. Charles'; }
  let title = pretty(name).replace('U.S. Representative', 'U.S. House').replace('State Representative', 'State House').replace('State Senator', 'State Senate').replace('Constitutional Amendment No.', 'Amendment').replace('St. Charles Council Member Ward 4 Unexpired Term', 'Ward 4 Special Election');
  if (name.startsWith('RETAIN')) title = pretty(name.replace(/^RETAIN (?:SUPREME COURT|EASTERN DISTRICT COURT OF APPEALS) JUDGE /, 'Retain '));
  return { title, jurisdiction, category, countyOnly };
}
function approval(name: string): ApprovalRule | null {
  if (name === 'FRANCIS HOWELL R-III PROPOSITION H') return { numerator: 4, denominator: 7, strict: false, label: 'Four-sevenths (57.14%)', source: FAQ };
  if (name === 'FRANCIS HOWELL R-III PROPOSITION O') return { numerator: 1, denominator: 2, strict: true, label: 'Simple majority', source: FAQ };
  // Other rules are intentionally unassigned until verified against authoritative sources.
  return null;
}
export function choiceColor(name: string, party: string | null, index: number) {
  if (key(name) === 'YES') return '#167b65'; if (key(name) === 'NO') return '#bc514d';
  if (key(name).startsWith('WRITE')) return '#89919b';
  if (party?.includes('REPUBLICAN')) return '#c25155'; if (party?.includes('DEMOCRATIC')) return '#3b73b7';
  if (party?.includes('LIBERTARIAN')) return '#b88a31'; return ['#6575ad', '#239789', '#bb8043'][index % 3];
}

export function parseUnitStatuses(html: string): Record<string, UnitStatus> {
  const match = html.match(/var\s+precinctData\s*=\s*'([^\r\n]+?)';/);
  if (!match) return {};
  try {
    const source = JSON.parse(match[1]); const result: Record<string, UnitStatus> = {};
    for (const [id, value] of Object.entries(source)) {
      const status = key((value as Record<string, unknown>).StatusValue);
      result[id] = /NOT REPORTED/.test(status) ? 'not-reported' : /PARTIAL/.test(status) ? 'partial' : /REPORT/.test(status) ? 'reported' : 'unknown';
    }
    return result;
  } catch { return {}; }
}

export async function hashContent(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}

export async function buildSnapshot(xml: string, csv: string, options: { sourceId?: string; fetchedAt?: string; statuses?: Record<string, UnitStatus>; expectedContests?: number; electionId?: string } = {}): Promise<Snapshot> {
  if (XMLValidator.validate(xml.replace(/^\uFEFF/, '')) !== true) throw new Error('Invalid county summary XML');
  const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true }).parse(xml.replace(/^\uFEFF/, ''));
  const root = parsed.NewDataSet; if (!root || !root.Table) throw new Error('County summary XML has no results');
  const sourceId = options.sourceId ?? '33'; const entries = Array.isArray(root.Table) ? root.Table : [root.Table];
  const contests = new Map<string, Contest>(); const joins = new Map<string, { contest: Contest; option: Choice }>();
  for (const r of entries) {
    if (String(r.ElectionID) !== sourceId) throw new Error('Upstream election ID does not match configured election');
    const id = String(r.RaceID), name = normalize(r.RaceName);
    if (!id || !name) throw new Error('Missing contest identity');
    let contest = contests.get(id);
    if (!contest) {
      contest = { id, sourceName: name, ...describe(name), type: name.startsWith('RETAIN') ? 'retention' : 'candidate', voteFor: integer(r.VoteFor, 'vote-for count'), positions: integer(r.NumPositions, 'positions'), totalVotes: 0, reported: integer(r.PrecReported, 'reporting count'), totalReportingUnits: integer(r.NumberOfPrec, 'reporting denominator'), geographicUnits: 0, choices: [], units: [], approvalRule: approval(name) };
      if (contest.reported > contest.totalReportingUnits) throw new Error(`Invalid reporting count for ${name}`);
      contests.set(id, contest);
    } else if (contest.sourceName !== name) throw new Error('Duplicate race ID with different name');
    else if (contest.reported !== integer(r.PrecReported, 'reporting count') || contest.totalReportingUnits !== integer(r.NumberOfPrec, 'reporting denominator')) throw new Error(`Inconsistent reporting counts for ${name}`);
    const choice: Choice = { id: String(r.ContestantID), name: normalize(r.ContestantName), party: normalize(r.Party) || null, votes: integer(r.TotalVotes, 'candidate total'), color: '', writeIn: key(r.ContestantWriteIn) === 'Y' || /^WRITE[ -]?IN$/.test(key(r.ContestantName)) };
    choice.color = choiceColor(choice.name, choice.party, contest.choices.length);
    const join = key(name) + '\u0000' + key(choice.name);
    if (joins.has(join) || contest.choices.some(c => c.id === choice.id)) throw new Error(`Ambiguous candidate in ${name}`);
    joins.set(join, { contest, option: choice }); contest.choices.push(choice); contest.totalVotes += choice.votes;
  }
  if (options.expectedContests !== undefined && contests.size !== options.expectedContests) throw new Error(`Expected ${options.expectedContests} contests, received ${contests.size}`);
  const rows = parseCSV(csv); const headerIndex = rows.findIndex(row => row[0] === 'Precinct' && row[1] === 'Contest Name');
  if (headerIndex < 0) throw new Error('Missing precinct CSV header');
  const header = rows[headerIndex]; const needed = ['Precinct', 'Contest Name', 'Candidate Name', 'Votes'];
  if (needed.some(v => !header.includes(v))) throw new Error('County CSV columns changed');
  const column = (row: string[], name: string) => row[header.indexOf(name)];
  const unitMaps = new Map<string, Map<string, Contest['units'][number]>>(); const seen = new Set<string>();
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.length !== header.length) throw new Error('Malformed precinct CSV row');
    const joined = joins.get(key(column(row, 'Contest Name')) + '\u0000' + key(column(row, 'Candidate Name')));
    if (!joined) throw new Error(`Unmatched county CSV candidate: ${column(row, 'Candidate Name')}`);
    const { contest, option } = joined; const pid = normalize(column(row, 'Precinct'));
    if (!pid || (!/^\d+$/.test(pid) && !/^(ABSENTEE|CENTRAL \d+)$/.test(pid))) throw new Error(`Unrecognized reporting unit: ${pid}`);
    const unique = `${contest.id}:${pid}:${option.id}`; if (seen.has(unique)) throw new Error(`Duplicate precinct/candidate row: ${unique}`); seen.add(unique);
    let units = unitMaps.get(contest.id); if (!units) { units = new Map(); unitMaps.set(contest.id, units); }
    let unit = units.get(pid);
    if (!unit) { unit = { id: pid, geographic: /^\d+$/.test(pid), totalVotes: 0, votes: {}, status: options.statuses?.[pid] ?? 'unknown', turnout: null }; units.set(pid, unit); }
    const votes = integer(column(row, 'Votes'), 'precinct votes'); unit.votes[option.id] = votes; unit.totalVotes += votes;
    // The CSV's turnout column is not reliable in a pre-election zero report.
  }
  for (const contest of contests.values()) {
    const units = unitMaps.get(contest.id); if (!units?.size) throw new Error(`No precinct rows for ${contest.sourceName}`);
    contest.units = [...units.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    contest.geographicUnits = contest.units.filter(u => u.geographic).length;
    if (contest.totalReportingUnits !== contest.units.length) throw new Error(`Reporting-unit coverage changed for ${contest.sourceName}`);
    if (contest.reported === contest.totalReportingUnits) for (const unit of contest.units) unit.status = 'reported';
    for (const choice of contest.choices) {
      let total = 0;
      for (const unit of contest.units) { if (!(choice.id in unit.votes)) throw new Error(`Missing candidate row in precinct ${unit.id}`); total += unit.votes[choice.id]; }
      if (total !== choice.votes) throw new Error(`Sources out of sync for ${contest.sourceName}: ${choice.name} (${total} vs ${choice.votes})`);
    }
    if (contest.choices.length === 2 && contest.choices.every(c => ['YES', 'NO'].includes(key(c.name)))) contest.type = contest.type === 'retention' ? 'retention' : 'measure';
  }
  const list = [...contests.values()].sort((a, b) => Number(a.id) - Number(b.id));
  const allUnits = new Set(list.flatMap(c => c.units.map(u => u.id))); const numericUnits = [...allUnits].filter(v => /^\d+$/.test(v));
  const hasVotes = list.some(c => c.totalVotes > 0); const registered = integer(root.RegisteredVoters, 'registered voters');
  const generatedAt = normalize(root.GeneratedDate); if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) throw new Error('Missing or invalid publication timestamp');
  const snapshot: Snapshot = { schemaVersion: 1, electionId: options.electionId ?? '2026-11-03', sourceElectionId: sourceId, title: 'St. Charles County General Election', date: options.electionId ?? '2026-11-03', timeZone: 'America/Chicago', generatedAt, fetchedAt: options.fetchedAt ?? new Date().toISOString(), dataHash: '', phase: allContestsReported(list) ? 'complete' : hasVotes ? 'reporting' : 'awaiting-results', totalBallots: hasVotes ? integer(root.TotalBallotsCast, 'ballots') : null, registeredVoters: registered > 0 ? registered : null, turnout: registered > 0 ? nullableRate(root.VoterTurnout) : null, geographicUnits: numericUnits.length, reportingUnits: allUnits.size, contests: list };
  snapshot.dataHash = await hashContent({ generatedAt, contests: list, totalBallots: snapshot.totalBallots, registeredVoters: snapshot.registeredVoters, turnout: snapshot.turnout });
  return snapshot;
}
