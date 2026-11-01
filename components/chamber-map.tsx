import { useEffect, useId, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { Maximize2 } from 'lucide-react';
import type { Contest } from '@/lib/election/types';
import { chamberMapColor, districtNumber, type ChamberMapMode, type ChamberPrecinct, type RaceComparisons } from '@/lib/election/chambers';
import { leader, unitLabel, formatNumber, share } from '@/lib/election/presentation';
import { percent, points } from '@/lib/election/benchmarks';
import { assetUrl } from '@/lib/client-config';
export default function ChamberMap({ title, races, units, mode, comparisons, selected, onSelect }: { title: string; races: Contest[]; units: ChamberPrecinct[]; mode: ChamberMapMode; comparisons: RaceComparisons; selected: string; onSelect: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null); const map = useRef<Leaflet.Map | null>(null); const layer = useRef<Leaflet.GeoJSON | null>(null);
  const latest = useRef({ races, units, mode, comparisons, selected, onSelect }); latest.current = { races, units, mode, comparisons, selected, onSelect };
  const patternId = 'split-' + useId().replace(/[^a-z0-9]/gi, ''); const pattern = `url(#${patternId})`;
  const [ready, setReady] = useState(false); const [error, setError] = useState<string | null>(null); const [move, setMove] = useState(false);
  useEffect(() => {
    let disposed = false; const abort = new AbortController(); let observer: ResizeObserver | undefined;
    async function init() {
      try {
        const [L, response] = await Promise.all([import('leaflet'), fetch(assetUrl('data/precincts.geojson'), { signal: abort.signal })]);
        if (!response.ok) throw new Error('Precinct map could not load'); const geometry = await response.json() as GeoJSON.FeatureCollection;
        if (disposed || !host.current) return;
        const phone = window.matchMedia('(max-width: 850px)').matches;
        const m = L.map(host.current, { minZoom: 9, maxZoom: 16, dragging: !phone, touchZoom: !phone, doubleClickZoom: !phone, scrollWheelZoom: false }); map.current = m;
        m.attributionControl.addAttribution('<a href="https://sccmo.org/410/Election-Authority" target="_blank" rel="noreferrer">St. Charles County precinct boundaries</a>');
        function style(feature?: GeoJSON.Feature) {
          const data = latest.current; const pid = String(feature?.properties?.DIST_NUM); const item = data.units.find(u => u.id === pid && u.geographic);
          return { color: data.selected === pid ? '#173047' : item?.split ? '#685c79' : '#7d929d', weight: data.selected === pid ? 3 : item?.split ? 1.7 : .85, fillColor: chamberMapColor(item, data.races, data.mode, data.comparisons, pattern), fillOpacity: item ? .9 : .35, dashArray: item?.split ? '3 2' : undefined };
        }
        const polygons = L.geoJSON(geometry, { style, onEachFeature(feature, polygon) {
          const pid = String(feature.properties?.DIST_NUM);
          const choose = () => { if (latest.current.units.some(u => u.id === pid && u.geographic)) latest.current.onSelect(pid); };
          polygon.on({ click: choose, mouseover() {
            const data = latest.current; const item = data.units.find(u => u.id === pid && u.geographic);
            (polygon as Leaflet.Path).setStyle({ weight: 2.5, color: '#173047' });
            const tip = document.createElement('div'); tip.className = 'precinct-tip chamber-tip';
            const heading = document.createElement('strong'); heading.textContent = `Precinct ${pid}${item?.split ? ' · split district' : ''}`; tip.appendChild(heading);
            if (!item) { const note = document.createElement('p'); note.textContent = 'No included race in this election'; tip.appendChild(note); }
            for (const { contest, unit } of item?.races ?? []) {
              const row = document.createElement('div'); const name = document.createElement('span'); name.textContent = `District ${districtNumber(contest)}`;
              const win = leader(contest, unit); const value = document.createElement('b'); value.textContent = !unit.totalVotes ? 'No votes yet' : win && !win.tie ? `${win.choice.name} ${share(win.choice.votes, unit.totalVotes)}` : 'Currently tied'; row.appendChild(name); row.appendChild(value); tip.appendChild(row);
              const status = document.createElement('small'); status.textContent = `${unitLabel(unit)} · ${formatNumber(unit.totalVotes)} selections`; tip.appendChild(status);
              if (data.mode === 'baseline' || data.mode === 'variance') { const comparison = data.comparisons[contest.id]?.[pid]; const note = document.createElement('p'); note.textContent = `Comparison ${percent(comparison?.baseline)} · selected election ${percent(comparison?.current)} · change ${points(comparison?.delta)}`; tip.appendChild(note); }
            }
            polygon.bindTooltip(tip, { sticky: true, direction: 'top', className: 'results-tooltip', opacity: 1 }).openTooltip();
          }, mouseout() { (polygon as Leaflet.Path).setStyle(style(feature)); polygon.closeTooltip(); }, add() {
            const el = (polygon as Leaflet.Path).getElement(); if (!el) return; const exists = latest.current.units.some(u => u.id === pid && u.geographic);
            el.setAttribute('role', 'button'); el.setAttribute('tabindex', exists ? '0' : '-1'); el.setAttribute('aria-disabled', String(!exists)); el.setAttribute('aria-label', `Show precinct ${pid} district results`);
            el.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') { event.preventDefault(); choose(); } });
          } });
        } }).addTo(m); layer.current = polygons;
        // One precinct polygon can span district boundaries. A hatch marks ambiguity without assigning votes to land.
        const svg = host.current.querySelector('svg'); if (svg) {
          const ns = 'http://www.w3.org/2000/svg'; const defs = document.createElementNS(ns, 'defs'); const fill = document.createElementNS(ns, 'pattern');
          for (const [key, value] of Object.entries({ id: patternId, width: '8', height: '8', patternUnits: 'userSpaceOnUse' })) fill.setAttribute(key, value);
          const background = document.createElementNS(ns, 'rect'); background.setAttribute('width', '8'); background.setAttribute('height', '8'); background.setAttribute('fill', '#e7dff0'); fill.appendChild(background);
          const stroke = document.createElementNS(ns, 'path'); stroke.setAttribute('d', 'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6'); stroke.setAttribute('stroke', '#8d739e'); stroke.setAttribute('stroke-width', '2'); fill.appendChild(stroke); defs.appendChild(fill); svg.insertBefore(defs, svg.firstChild);
        }
        m.fitBounds(polygons.getBounds(), { padding: [22, 22], animate: false });
        observer = new ResizeObserver(() => m.invalidateSize({ animate: false })); observer.observe(host.current); setReady(true);
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Map unavailable'); }
    }
    void init(); return () => { disposed = true; abort.abort(); observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, [pattern, patternId]);
  useEffect(() => {
    if (!ready || !layer.current) return;
    layer.current.setStyle(feature => { const pid = String(feature?.properties?.DIST_NUM); const item = units.find(u => u.id === pid && u.geographic); return { color: selected === pid ? '#173047' : item?.split ? '#685c79' : '#7d929d', weight: selected === pid ? 3 : item?.split ? 1.7 : .85, fillColor: chamberMapColor(item, races, mode, comparisons, pattern), fillOpacity: item ? .9 : .35, dashArray: item?.split ? '3 2' : undefined }; });
  }, [races, units, mode, comparisons, selected, pattern, ready]);
  useEffect(() => { if (!ready || !map.current) return; const m = map.current; const screen = window.matchMedia('(max-width:850px)'); const apply = () => { if (move || !screen.matches) { m.dragging.enable(); m.touchZoom.enable(); } else { m.dragging.disable(); m.touchZoom.disable(); } }; apply(); screen.addEventListener('change', apply); return () => screen.removeEventListener('change', apply); }, [move, ready]);
  return <div className={`county-map-shell ${move ? 'is-interactive' : ''}`}><button className="map-gesture" aria-pressed={move} onClick={() => setMove(v => !v)}>{move ? 'Done moving map' : 'Move & zoom map'}</button><div ref={host} className="county-map" aria-label={`Combined precinct map for ${title}`} />{!ready && <div className="map-loading">{error ?? 'Loading precincts…'}</div>}<button className="fit-map" onClick={() => { if (map.current && layer.current) map.current.fitBounds(layer.current.getBounds(), { padding: [22, 22], animate: false }); }}><Maximize2 size={14} /> Fit county</button></div>;
}
