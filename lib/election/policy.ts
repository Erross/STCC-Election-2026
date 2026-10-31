import type { Snapshot } from './types.ts';

// Nov 3, 7 p.m. CST. A page opened beforehand loads the cached catalog and wakes then.
export const COLLECTION_START = '2026-11-04T01:00:00Z';
export const REFRESH_MS = 60_000;
export function allContestsReported(contests: Snapshot['contests']) {
  return contests.length > 0 && contests.every(c => c.totalReportingUnits > 0 && c.reported === c.totalReportingUnits);
}
export function collectionPolicy(snapshot: Snapshot, now: number, lastAttempt = 0) {
  if (snapshot.phase === 'complete' && allContestsReported(snapshot.contests)) return { state: 'complete' as const, startsAt: COLLECTION_START, refreshEverySeconds: REFRESH_MS / 1000, nextCheckAt: null };
  if (now < Date.parse(COLLECTION_START)) return { state: 'scheduled' as const, startsAt: COLLECTION_START, refreshEverySeconds: REFRESH_MS / 1000, nextCheckAt: COLLECTION_START };
  return { state: 'active' as const, startsAt: COLLECTION_START, refreshEverySeconds: REFRESH_MS / 1000, nextCheckAt: new Date(Math.max(now, lastAttempt + REFRESH_MS)).toISOString() };
}
export function refreshIsDue(snapshot: Snapshot, now: number, lastAttempt = 0) {
  return collectionPolicy(snapshot, now, lastAttempt).state === 'active' && now - lastAttempt >= REFRESH_MS;
}
