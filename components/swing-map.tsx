'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Contest } from '@/lib/election/types';
import type { Benchmarks } from '@/lib/election/benchmarks';
import { assetUrl } from '@/lib/client-config';
import { calculateSwingPoints, swingDirection, swingEligibleRaces, SWING_ALL, type SwingPoint } from '@/lib/election/swing';

const display = (v: number | null) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + ' pp';

/** Editorial arrow mark: a clean diagonal vector with a thin white keyline,
 * not a circular map pin. Icon size varies modestly with absolute swing.
 */
export function swingMarkerSvg(direction: 'democratic' | 'republican' | 'neutral', magnitude = 0, zoomScale = 1): string {
  if (direction === 'neutral') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">'
      + '<circle cx="20" cy="20" r="3" fill="#7c909d" stroke="#fff" stroke-width="1.6"/></svg>';
  }
  const color = direction === 'democratic' ? '#2868a8' : '#bc4851';
  const scale = ((0.63 + Math.min(18, Math.max(0, magnitude)) / 18 * 0.32) * Math.max(0.45, Math.min(1.3, zoomScale))).toFixed(3);
  // Draw once in the northeast direction and mirror for Democratic shifts.
  const reflect = direction === 'democratic' ? ' transform="translate(40 0) scale(-1 1)"' : '';
  const geometry = 'M12 28 L28 12 M18 12 H28 V22';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">'
    + '<g transform="translate(20 20) scale(' + scale + ') translate(-20 -20)">'
    + '<g' + reflect + '>'
    + '<path d="' + geometry + '" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="' + geometry + '" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</g></g></svg>';
}

function ArrowMap({ points }: { points: SwingPoint[] }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const api = useRef<typeof Leaflet | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const boundaries = useRef<Leaflet.GeoJSON | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); let disposed = false; let observer: ResizeObserver | undefined;
    async function init() {
      try {
        const [L, response] = await Promise.all([import('leaflet'), fetch(assetUrl('data/precincts.geojson'), { signal: abort.signal })]);
        if (!response.ok) throw new Error('Precinct boundaries are temporarily unavailable.');
        const geo = await response.json() as GeoJSON.FeatureCollection;
        if (!element.current || disposed) return;
        api.current = L;
        const m = L.map(element.current, { minZoom: 8, maxZoom: 16, scrollWheelZoom: false });
        map.current = m;
        m.attributionControl.addAttribution('<a href="https://sccmo.org/410/Election-Authority" target="_blank" rel="noreferrer">St. Charles County precinct boundaries</a>');
        boundaries.current = L.geoJSON(geo, {
          style: { color: '#839eae', weight: 0.8, fillColor: '#e2ebee', fillOpacity: 0.85 },
          onEachFeature(feature, layer) {
            const id = String(feature.properties?.DIST_NUM ?? '');
            layer.bindTooltip('Precinct ' + id, { sticky: true });
          },
        }).addTo(m);
        markers.current = L.layerGroup().addTo(m);
        m.fitBounds(boundaries.current.getBounds(), { padding: [24, 24], animate: false });
        observer = new ResizeObserver(() => m.invalidateSize({ animate: false }));
        observer.observe(element.current);
        setReady(true);
      } catch (e) {
        if (!disposed && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'Map could not load.');
      }
    }
    void init();
    return () => { disposed = true; abort.abort(); observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !api.current || !boundaries.current || !markers.current || !map.current) return;
    const L = api.current;
    const m = map.current;
    const group = markers.current;
    const byId = new Map(points.map(p => [p.id, p]));
    boundaries.current.setStyle(feature => {
      const point = byId.get(String(feature?.properties?.DIST_NUM));
      return { color: '#9baeb8', weight: 0.8, fillColor: point ? '#f6f8f9' : '#e8eff2', fillOpacity: 0.92 };
    });

    // Render every eligible precinct marker, even when neighboring markers overlap.
    // At county scale, make each vector smaller; zooming enlarges it.
    // Never suppress a valid swing because of screen-space collisions.
    const items: { id: string; point: SwingPoint; center: Leaflet.LatLng }[] = [];
    boundaries.current.eachLayer(layer => {
      const feature = (layer as Leaflet.Layer & { feature?: GeoJSON.Feature }).feature;
      const id = String(feature?.properties?.DIST_NUM ?? '');
      const point = byId.get(id);
      if (!point || point.delta == null) return;
      items.push({ id, point, center: (layer as Leaflet.Polygon).getBounds().getCenter() });
    });
    const update = () => {
      group.clearLayers();
      const zoomScale = m.getZoom() >= 13 ? 1 : m.getZoom() >= 12 ? 0.85 : m.getZoom() >= 11 ? 0.72 : 0.60;
      const visible = items.filter(item => m.getBounds().contains(item.center));
      for (const item of visible) {
        const direction = swingDirection(item.point.delta);
        const marker = L.marker(item.center, {
          icon: L.divIcon({
            html: swingMarkerSvg(direction, Math.abs(item.point.delta!), zoomScale),
            className: 'swing-arrow-icon swing-arrow-icon-' + direction,
            iconSize: [40, 40], iconAnchor: [20, 20],
          }),
          keyboard: true,
        });
        const label = 'Precinct ' + item.id + ': ' + display(item.point.delta)
          + ' toward ' + (direction === 'democratic' ? 'Democrats' : direction === 'republican' ? 'Republicans' : 'neither side')
          + '; ' + item.point.races + ' comparable ' + (item.point.races === 1 ? 'race' : 'races');
        marker.bindTooltip(label, { direction: 'top' });
        const popup = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = 'Precinct ' + item.id;
        popup.appendChild(heading);
        const detail = document.createElement('p');
        detail.textContent = '2026 mean D share: ' + (item.point.current! * 100).toFixed(1)
          + '%; 2024 benchmark: ' + (item.point.baseline! * 100).toFixed(1)
          + '%; shift: ' + display(item.point.delta) + '. ' + item.point.races + ' comparable races.';
        popup.appendChild(detail);
        marker.bindPopup(popup);
        marker.addTo(group);
      }
    };
    m.on('zoomend moveend resize', update);
    update();
    return () => { m.off('zoomend moveend resize', update); group.clearLayers(); };
  }, [ready, points]);
  return <div className="swing-map-wrap"><div ref={element} className="swing-map-canvas" role="img" aria-label="St. Charles County precinct map with partisan swing arrows" />{!ready && <p role="status" className="map-loading">{error ?? 'Loading precinct map…'}</p>}</div>;
}
export default function SwingMap({ contests, benchmarks, date }: { contests: Contest[]; benchmarks: Benchmarks | null; date: string }) {
  const [race, setRace] = useState(SWING_ALL);
  const eligible = useMemo(() => swingEligibleRaces(contests), [contests]);
  const selected = eligible.some(c => c.id === race) ? race : SWING_ALL;
  const points = useMemo(() => benchmarks ? calculateSwingPoints(contests, benchmarks, selected) : [], [contests, benchmarks, selected]);
  const positive = points.filter(p => swingDirection(p.delta) === 'democratic').length;
  const negative = points.filter(p => swingDirection(p.delta) === 'republican').length;
  const chosenRace = eligible.find(c => c.id === selected);
  const sameOffice = chosenRace && benchmarks?.general.find(g => g.year === '2024')?.races.some(r => r.name.replace(/[^A-Z0-9]/g, '') === chosenRace.sourceName.replace(/[^A-Z0-9]/g, ''));
  return <section className="swing-view" aria-label="Precinct swing map">
    <div className="swing-heading"><div><span className="eyebrow">VOTE SHIFT · 2024 TO {date.slice(0, 4)}</span><h2>Which way did each precinct move?</h2><p>Arrows show percentage-point change in Democratic two-party share. Blue northwest = more Democratic; red northeast = more Republican. All reported precincts have arrows; zoom in to separate closely spaced markers.</p></div></div>
    <div className="swing-controls"><label htmlFor="swing-race">Show swing for</label><select id="swing-race" value={selected} onChange={e => setRace(e.target.value)}><option value={SWING_ALL}>All contested D/R races · equal-weight average</option>{eligible.map(c => <option key={c.id} value={c.id}>{c.title} · {c.jurisdiction}</option>)}</select></div>
    {!benchmarks ? <p role="status">Historical comparison data is not yet available.</p> : <>
      <div className="swing-stats"><div><span>Precincts with comparable votes</span><strong>{points.length}</strong></div><div><span>Shifted toward Democrats</span><strong>{positive}</strong></div><div><span>Shifted toward Republicans</span><strong>{negative}</strong></div></div>
      <ArrowMap points={points} />
      <div className="swing-legend"><span className="swing-legend-dem"><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: swingMarkerSvg('democratic', 12) }} /> Toward Democrats</span><span className="swing-legend-rep"><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: swingMarkerSvg('republican', 12) }} /> Toward Republicans</span><span>Arrow size = magnitude, capped at 18 pp</span><span>Every comparable precinct has an arrow; missing data has none</span></div>
      <p className="swing-method"><strong>Method:</strong> {selected === SWING_ALL ? 'Each precinct receives the arithmetic mean of available race-level swings, giving each contested D/R race one equal vote in the average. Only published precinct D/R votes count; a district contest is not extrapolated outside its electorate.' : sameOffice ? 'This race is compared with the same office in the 2024 audited results where a matching precinct exists.' : 'This race is compared with the 2024 audited equal-weight D/R race average for the same precinct (not a same-office result).'} 2024 values are historical comparisons, not a prediction. Absentee and central units are excluded because they have no precinct geography. The set of races contributing to the all-races average varies by precinct, and arrows are provisional while reporting continues.</p>
      <div className="swing-table"><h3>Precinct shifts</h3><div className="swing-table-scroll"><table><thead><tr><th>Precinct</th><th>Direction</th><th>Change</th><th>Races</th></tr></thead><tbody>{points.map(p => <tr key={p.id}><td>{p.id}</td><td>{swingDirection(p.delta) === 'democratic' ? 'Toward D' : swingDirection(p.delta) === 'republican' ? 'Toward R' : 'No change'}</td><td>{display(p.delta)}</td><td>{p.races}</td></tr>)}</tbody></table></div></div>
    </>}
  </section>;
}
