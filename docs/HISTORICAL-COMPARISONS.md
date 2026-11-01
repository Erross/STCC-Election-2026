# Historical comparisons

The November 2026 feed and saved revisions remain independent of the historical benchmark catalog. `public/data/historical-benchmarks.json` contains only geographic historical counts, source URLs, hashes, certified check totals and PDF page references. It has no credential or live ingestion dependency.

## Coverage

- H/O: April 2026, 2025 and 2024 Francis Howell school-board slates. Definitions come from the owner's [original tracker](https://github.com/Erross/Election-Map/blob/main/election-app/public/slates.json), retained in `data/school-slates.json`. FH Forward is described as progressive and FH Families as conservative for this comparison. These are not ballot party labels and do not establish endorsements of H/O. Every slate has the same number of candidates as the other slate in that year.
- General: 18 verified contested D/R races in November 2024 and 15 in November 2022. The exact included race list and page references are visible in the app; the average covers this verified set, not an exhaustive claim about every race on the ballot. Only unambiguous printed REP and DEM columns are extracted. For example, the 2022 U.S. Senate Democratic candidate lacks a printed DEM tag in the PDF header, so that race is excluded rather than inferred.
- Same-office alternatives appear when that named office is in the verified set, even when candidates changed.
- 2024 general and 2024–2026 school county geometry is byte-identical to the county's November 2026 geometry: SHA-256 `54129bd9046795838ce5990bc8acfbf6540f214512b805cca66cacec12d71e85`. This verifies polygons, not unchanged district electorates inside split precincts.
- **2022 is explicitly approximate:** matching precinct IDs only. Boundary equivalence has not been independently verified. The app defaults to boundary-checked 2024 general results; 2022 carries a caveat in its menu and panel.

## Arithmetic

1. Slate share is the sum of the chosen slate's candidate selections divided by selections for both slates. It excludes write-ins/independents and is not a percent of unique voters.
2. General party share is D/(D+R), or its R complement. The race average is the arithmetic mean of each qualifying race's share in a precinct, giving each race equal weight. Zero D+R cells and missing races are excluded; contributing races vary by precinct.
3. For verified statewide party positions, the current share uses the corresponding endorsed Yes/No option. In neutral local comparisons, current Yes share is compared with the selected historical party share without asserting an endorsement. School mode always compares Yes share against the selected slate.
4. Variance is `(current share - historical share) * 100`, in percentage points of share, not margin. Positive means the displayed current option exceeds the selected baseline.
5. Before current votes are published, current share and variance are null. No zero-report swing, inferred voter choice or prediction is displayed. An uncontested current D/R race offers its historical baseline without a current partisan delta.
6. The overview uses only geographic precincts with both historical and current comparison votes. It weights each precinct's historical share by that precinct's current D+R or Yes+No votes. This compares the same reporting precincts on both sides and excludes unmatched/zero-vote precincts. Coverage is always shown and results are provisional while reporting.
7. ABSENTEE and CENTRAL units are excluded from every comparison. They remain separate and included in the ordinary live totals. No residual vote is assigned to a polygon. Historical and current split precincts may contain different electorate subsets; even a matched polygon is a descriptive benchmark.

## Sources and verification

General counts come from the certified county PDFs:

- [November 2024](https://www.sccmo.org/DocumentCenter/View/25818/SOVC_OFFICIAL-Nov-2024)
- [November 2022](https://www.sccmo.org/ArchiveCenter/ViewFile/Item/4877)

`python scripts/build-historical-data.py` uses Poppler `pdftotext -bbox-layout`, resolves candidate vote columns using their explicit party headers, rejects ambiguous/duplicate cells, and checks every extracted D and R sum against the published total, including the special units before excluding them. The 2024 PDF is also independently checked against all **1,972 geographic D/R CSV cells**. The archive CSVs omit absentee votes; the live adapter's reconciliation rule has not been loosened to accept them.

School counts come from county election archives 31 (2026), 30 (2025) and 27 (2024). Hashes are retained for XML/CSV, every named slate candidate must exist exactly once in each reporting unit, candidate sums cannot exceed XML totals, and 2026 sums must equal the XML. The 2026 counts also have a test against the independently validated full April snapshot. Earlier school CSVs omit absentee and are used only for their explicitly geographic rows. Downloads are cached under ignored `work/history`; the small generated catalog is committed. Rebuilding requires Python 3, Poppler and internet access and intentionally fails if source checks change.

Verified 2026 statewide party positions (checked November 1):

| Question | Democratic | Republican |
| --- | --- | --- |
| Amendment 3 | No | Yes |
| Amendment 6 | Yes | No |
| Amendment 7 | No | Yes |
| Amendment 8 | No | Yes |
| Proposition A | No | Yes |

Sources: [Missouri Democratic Party election center](https://www.missouridemocrats.org/2026-general-election), [Missouri GOP ballot guide](https://missouri.gop/wp-content/uploads/sites/26/2026/10/Ballot_Guide_Full-2.pdf). Party positions describe the organizations, not all their voters. Other local questions and judicial retentions have no verified assignment in this release and are visibly labeled neutral comparisons.

## UI

Each contest has a benchmark selector, baseline side, provisional matched-precinct overview, source/limitations disclosure and CSV comparison export. Historical baseline and variance map modes use a distinct teal/orange scale: baseline centered on 50%, variance centered on zero; saturation reaches 20 percentage points. Gray means missing baseline or awaiting votes. Table columns, precinct details and hover tooltips expose the selected shares and percentage-point variance. Historical catalog failure does not block live results.
