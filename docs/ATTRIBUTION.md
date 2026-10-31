# Attribution and provenance

This is a separate implementation based on the user-owned `Erross/Election-Map` project. Its Leaflet polygon map, map resizing, hover/click inspection, and label-layer approach informed `components/county-map.tsx`.

Reference files inspected: `ElectionMap.jsx`, `LabelLayer.jsx`, `MobilePrecinctPanel.jsx`, `colorScale.js`, `App.jsx`, `liveFetcher.js`, and the legacy Worker source/configuration. Original repository: https://github.com/Erross/Election-Map. No changes were made there.

The map geometry and result fixtures originate from St. Charles County's published election pages. `tests/fixtures` contains April election 31 and November election 33 source files used for deterministic validation. `public/data/precincts.geojson` is the November election-specific boundary file. The map uses locally served geometry and does not request third-party map tiles.

This GitHub version uses React, Vite, Leaflet, Lucide and fast-xml-parser under their upstream licenses. It excludes the Sites runtime and vendored integration files.

The HTML fixture is a verbatim excerpt of the county page's precinctData assignment. Unrelated markup is omitted; CSV/XML fixtures remain complete.
