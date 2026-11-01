import deployment from '../deployment.json';

// Vite substitutes these public values at build time. Never put secrets here.
const configured = (import.meta.env.VITE_RESULTS_API_URL ?? '').trim() || deployment.resultsApiUrl;
export const backendConfigured = Boolean(configured);
const apiOrigin = configured.replace(/\/$/, '');
export function apiUrl(path: string) { return `${apiOrigin}${path}`; }
export function assetUrl(path: string) { return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`; }
