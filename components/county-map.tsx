'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Contest } from '@/lib/election/types';
import { mapColor, leader, shortName, unitLabel, formatNumber, share } from '@/lib/election/presentation';
import { comparisonColor, percent, points, type Comparison, type MapMode } from '@/lib/election/benchmarks';
import { assetUrl } from '@/lib/client-config';
import { Maximize2 } from 'lucide-react';

/** Generalizes the original Election-Map's Leaflet polygons, resize handling,
 * precinct hover/click, and labels to contest-specific membership. */
export default function CountyMap({ contest, mode, comparisons, comparisonText, currentYear, labels, selectedUnit, onSelect }: { contest: Contest; mode: MapMode; currentYear: string; comparisons: Record<string, Comparison>; comparisonText: { current: string; baseline: string } | null; labels: boolean; selectedUnit: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<Leaflet.Map | null>(null);
  const api = useRef<typeof Leaflet | null>(null); const polygons = useRef<Leaflet.GeoJSON | null>(null); const markers = useRef<Leaflet.LayerGroup | null>(null);
  const latest = useRef({ contest, mode, comparisons, comparisonText, currentYear, selectedUnit, onSelect }); latest.current = { contest, mode, comparisons, comparisonText, currentYear, selectedUnit, onSelect };
  const [ready, setReady] = useState(false); const [moveMap, setMoveMap] = useState(false); const [error, setError] = useState<string | null>(null); const geometry = useRef<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    let disposed = false; const abort = new AbortController(); let observer: ResizeObserver | null = null;
    async function init() {
      try {
        const [L, response] = await Promise.all([import('leaflet'), fetch(assetUrl('data/precincts.geojson'), { signal: abort.signal })]);
        if (!response.ok) throw new Error('Precinct boundaries could not load'); const geo = await response.json() as GeoJSON.FeatureCollection;
        if (disposed || !container.current) return; api.current = L; geometry.current = geo;
        const phone = window.matchMedia('(max-width: 850px)').matches;
        const m = L.map(container.current, { minZoom: 9, maxZoom: 16, scrollWheelZoom: false, dragging: !phone, touchZoom: !phone, doubleClickZoom: !phone }); map.current = m;
        // Local election geometry is sufficient for the precinct view. Avoid an
        // external tile service's account, availability, and usage-policy dependency.
        m.attributionControl.addAttribution('<a href="https://sccmo.org/410/Election-Authority" target="_blank" rel="noreferrer">St. Charles County precinct boundaries</a>');
        function style(feature?: GeoJSON.Feature) {
          const { contest: c, mode: view, selectedUnit: selected } = latest.current;
          const pid = String(feature?.properties?.DIST_NUM); const unit = c.units.find(u => u.id === pid) ?? null;
          return { color: selected === pid ? '#132d42' : unit ? '#7d929d' : '#bac5ca', weight: selected === pid ? 3 : .85, fillColor: view === 'baseline' || view === 'variance' ? comparisonColor(unit, latest.current.comparisons[pid], view) : mapColor(c, unit, view), fillOpacity: unit ? .89 : .32 };
        }
        const layer = L.geoJSON(geo, { style, onEachFeature(feature, polygon) {
          const pid = String(feature.properties?.DIST_NUM);
          const choose = () => { if (latest.current.contest.units.some(u => u.id === pid)) latest.current.onSelect(pid); };
          polygon.on({ mouseover() {
            const c = latest.current.contest; const unit = c.units.find(u => u.id === pid) ?? null;
            (polygon as Leaflet.Path).setStyle({ weight: 2.5, color: '#203f54' });
            const tip = document.createElement('div'); tip.className = 'precinct-tip';
            const title = document.createElement('strong'); title.textContent = `Precinct ${pid}`; tip.appendChild(title);
            const status = document.createElement('span'); status.className = 'precinct-tip-status'; status.textContent = unitLabel(unit); tip.appendChild(status);
            if (unit) for (const option of c.choices) {
              const row = document.createElement('div'); const name = document.createElement('span'); name.textContent = option.name;
              const value = document.createElement('b'); value.textContent = `${formatNumber(unit.votes[option.id])} · ${share(unit.votes[option.id], unit.totalVotes)}`; row.appendChild(name); row.appendChild(value); tip.appendChild(row);
            }
            const comparison = latest.current.comparisons[pid]; const text = latest.current.comparisonText;
            if (unit && text) { for (const [label, value] of [[text.baseline, percent(comparison?.baseline)], [`${latest.current.currentYear} ${text.current}`, percent(comparison?.current)], ['Change', points(comparison?.delta)]]) { const row = document.createElement('div'); const name = document.createElement('span'); name.textContent = label; const valueEl = document.createElement('b'); valueEl.textContent = value; row.appendChild(name); row.appendChild(valueEl); tip.appendChild(row); } }
            polygon.bindTooltip(tip, { sticky: true, direction: 'top', className: 'results-tooltip', opacity: 1 }).openTooltip();
          }, mouseout() { (polygon as Leaflet.Path).setStyle(style(feature)); polygon.closeTooltip(); }, click: choose, add() {
            const el = (polygon as Leaflet.Path).getElement(); if (el) { el.setAttribute('tabindex', latest.current.contest.units.some(u => u.id === pid) ? '0' : '-1'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', `Show precinct ${pid} results`); el.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') choose(); }); }
          } });
        } }).addTo(m);
        polygons.current = layer; markers.current = L.layerGroup().addTo(m);
        const initialIds = new Set(latest.current.contest.units.map(u => u.id));
        const initialGeometry: GeoJSON.FeatureCollection = { ...geo, features: geo.features.filter(f => initialIds.has(String(f.properties?.DIST_NUM))) };
        m.fitBounds(L.geoJSON(initialGeometry).getBounds(), { padding: [24, 24], animate: false });
        observer = new ResizeObserver(() => m.invalidateSize({ animate: false })); observer.observe(container.current); setReady(true);
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Map unavailable'); }
    }
    void init(); return () => { disposed = true; abort.abort(); observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !polygons.current || !api.current || !markers.current || !geometry.current) return;
    const L = api.current; const units = new Map(contest.units.map(u => [u.id, u]));
    polygons.current.setStyle(feature => { const pid = String(feature?.properties?.DIST_NUM); const u = units.get(pid) ?? null; return { color: selectedUnit === pid ? '#132d42' : u ? '#7d929d' : '#bac5ca', weight: selectedUnit === pid ? 3 : .85, fillColor: mode === 'baseline' || mode === 'variance' ? comparisonColor(u, comparisons[pid], mode) : mapColor(contest, u, mode), fillOpacity: u ? .89 : .32 }; });
    polygons.current.eachLayer(layer => { const path = layer as Leaflet.Path & { feature?: GeoJSON.Feature }; const pid = String(path.feature?.properties?.DIST_NUM); const el = path.getElement(); if (el) { el.setAttribute('tabindex', units.has(pid) ? '0' : '-1'); el.setAttribute('aria-disabled', String(!units.has(pid))); } });
    markers.current.clearLayers(); if (!labels) return;
    for (const feature of geometry.current.features) {
      const pid = String(feature.properties?.DIST_NUM); const unit = units.get(pid); if (!unit) continue;
      const g = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon; const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
      const ring = rings.sort((a, b) => b.length - a.length)[0]; if (!ring?.length) continue;
      const center: [number, number] = [ring.reduce((n, p) => n + p[1], 0) / ring.length, ring.reduce((n, p) => n + p[0], 0) / ring.length];
      const label = document.createElement('div'); label.className = 'map-label'; const id = document.createElement('b'); id.textContent = pid; label.appendChild(id);
      const win = leader(contest, unit); if (win && !win.tie && mode === 'margin') { const value = document.createElement('span'); value.textContent = `${shortName(win.choice)} ${(win.choice.votes / unit.totalVotes * 100).toFixed(0)}%`; label.appendChild(value); }
      if (mode === 'baseline' || mode === 'variance') { const value = document.createElement('span'); value.textContent = mode === 'baseline' ? percent(comparisons[pid]?.baseline) : points(comparisons[pid]?.delta); label.appendChild(value); }
      L.marker(center, { icon: L.divIcon({ html: label, className: 'precinct-label-icon', iconSize: [70, 28], iconAnchor: [35, 14] }), interactive: false }).addTo(markers.current);
    }
  }, [contest, mode, comparisons, labels, selectedUnit, ready]);
  useEffect(() => { if (!ready || !map.current || !window.matchMedia('(max-width: 850px)').matches) return; const m = map.current; if (moveMap) { m.dragging.enable(); m.touchZoom.enable(); } else { m.dragging.disable(); m.touchZoom.disable(); } }, [moveMap, ready]);
  function fit() { if (!api.current || !polygons.current || !map.current) return; const ids = new Set(contest.units.map(u => u.id)); const geo = geometry.current!; const filtered: GeoJSON.FeatureCollection = { ...geo, features: geo.features.filter(f => ids.has(String(f.properties?.DIST_NUM))) }; const layer = api.current.geoJSON(filtered); map.current.fitBounds(layer.getBounds(), { padding: [35, 35], animate: false }); }
  return <div className={`county-map-shell ${moveMap ? 'is-interactive' : ''}`}><button className="map-gesture" aria-pressed={moveMap} onClick={() => setMoveMap(v => !v)}>{moveMap ? 'Done moving map' : 'Move & zoom map'}</button><div ref={container} className="county-map" aria-label={`Interactive precinct map for ${contest.title}`} />{!ready && <div className="map-loading">{error ?? 'Loading county precincts…'}</div>}<button className="fit-map" onClick={fit}><Maximize2 size={14} /> Fit contest</button><div className="map-corner"><span>↑</span>N</div></div>;
}
