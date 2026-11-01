export type UnitStatus = 'reported' | 'partial' | 'not-reported' | 'unknown';
export type Category = 'Local measures' | 'Federal' | 'Statewide' | 'State legislature' | 'County' | 'Municipal' | 'Judicial' | 'Statewide measures';
export type Choice = { id: string; name: string; party: string | null; votes: number; color: string; writeIn: boolean };
export type ApprovalRule = { numerator: number; denominator: number; strict: boolean; label: string; source: string };
export type ResultUnit = { id: string; geographic: boolean; totalVotes: number; votes: Record<string, number>; status: UnitStatus; turnout: number | null };
export type Contest = {
  id: string; sourceName: string; title: string; jurisdiction: string; category: Category;
  type: 'candidate' | 'measure' | 'retention'; countyOnly: boolean;
  voteFor: number; positions: number; totalVotes: number;
  reported: number; totalReportingUnits: number; geographicUnits: number;
  choices: Choice[]; units: ResultUnit[]; approvalRule: ApprovalRule | null;
};
export type Snapshot = {
  schemaVersion: 1; electionId: string; sourceElectionId: string; title: string;
  date: string; timeZone: 'America/Chicago'; generatedAt: string; fetchedAt: string;
  dataHash: string; phase: 'awaiting-results' | 'reporting' | 'complete';
  totalBallots: number | null; registeredVoters: number | null; turnout: number | null;
  geographicUnits: number; reportingUnits: number; contests: Contest[];
};
export type FeedHealth = { state: 'healthy' | 'saved' | 'stale'; lastChecked: string | null; lastSuccess: string | null; error: string | null; refreshing: boolean; collection?: { state: 'scheduled' | 'active' | 'complete'; startsAt: string; refreshEverySeconds: number; nextCheckAt: string | null } };
export type FeedResponse = { snapshot: Snapshot; health: FeedHealth };
