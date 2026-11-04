# Historical comparisons

The November 2026 feed and saved revisions remain independent of the historical benchmark catalog. `public/data/historical-benchmarks.json` contains only geographic historical counts, source URLs, hashes, certified check totals and PDF page references. It has no credential or live ingestion dependency.

## Coverage

- H/O: April 2026, 2025, 2024 and 2023 Francis Howell school-board slates. Definitions come from the owner's [original tracker](https://github.com/Erross/Election-Map/blob/main/election-app/public/slates.json), retained in `data/school-slates.json`. FH Forward is described as progressive and FH Families as conservative for this comparison. These are not ballot party labels and do not establish endorsements of H/O. Every slate has the same number of candidates as the other slate in that year.
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
7. ABSENTEE and CENTRAL units are excluded from **mapped precinct comparisons** and never assigned to polygons. A separate expandable comparison matches like-named accounting units where historical totals exist, showing current share, historical share, change, and comparison-vote counts. General-election history uses certified PDF D/R `allUnits`; school history uses audited per-candidate `archive.units` with the selected slate definition. Reporting-unit definitions and voters may differ across elections, so this separate descriptive result is not pooled with the geographic estimate. Every special unit is included as a clearly named row in comparison CSV exports. Historical and current split precincts may contain different electorate subsets; even a matched polygon is a descriptive benchmark.

## Overall election swing: inclusion and publication rules

The **Overall election comparison** is a descriptive, matched-reporting-unit index and is never presented as the actual historical countywide party share. It complements (but does not replace) mapped-precinct and non-map breakouts. Its values use the current election as the weighting population.

1. **Matching:** Join each current reporting unit to the *same exact ID* in the chosen historical election and race/benchmark. A geographic unit must remain geographic; ABSENTEE / CENTRAL buckets remain non-geographic. Do not invent geography, redistribute votes or sum rows from overlapping races.
2. **Comparable denominator:** Candidate comparisons use D + R only; other parties and write-ins are outside the numerator and denominator. School board historical slate shares use selected candidates' selections for the two documented slates, not unique voters. Proposition comparisons use Yes + No in the selected election and the specified historical slate or party share. No alignment is inferred for local ballot measures.
3. **Unit inclusion:** A unit participates only if its selected-election denominator is positive, the selected numerator is defined and the historical benchmark contains a nonzero comparable denominator for the same unit ID. An archived average takes the equal-weight mean of its eligible races within *that* reporting unit. Missing categories are missing data, not a zero share.
4. **Weighting:** Let `wᵢ` be the current eligible votes or selections in each matched unit, `cᵢ` its current share and `hᵢ` the corresponding historical benchmark share. Then overall current = `Σ(wᵢ cᵢ)/Σwᵢ`, overall historical baseline = `Σ(wᵢ hᵢ)/Σwᵢ`, change = `100 × (current − baseline)` percentage points. This is the same current-weighting convention as the geographic comparison. It is **not** a historical pooled county vote total and **not** a prediction.
5. **Coverage:** Display matched current comparison votes, all current comparison votes, excluded/unmatched votes, matched geographic and special-unit counts, and reporting units received / possible. Unmatched units with current votes are identified in the method disclosure. Never silently treat a partial comparison as whole-election coverage.
6. **Zero reporting:** When no comparable votes have arrived, show missing current share, missing baseline and missing change (em dash), not 0%. If the vote shares cannot be compared, do not report an overall change.
7. **Completion:** Before every current reporting unit reports, label the comparison *provisional*. Even after all report, don't call it an all-voter historical swing unless each unit is matched and category definitions are comparable. The software cannot independently verify the stability of ABSENTEE / CENTRAL electorates across elections; the matched result therefore always carries a descriptive caveat.
8. **Independent views:** Continue showing the geographic comparison and separate ABSENTEE/CENTRAL comparison. The map shows geographic units only. CSV exports retain individual unit rows to permit verification and aggregation.

For measures such as H/O, the selected-election Yes share compared with a previous school-board slate share is a **cross-ballot descriptive difference**, not a claim about voter transitions or endorsements. A change in voter mix, turnout, district membership or special-unit accounting can influence it.

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

## Viewing completed elections

The **View election** selector now opens complete Francis Howell school-board races for April 2023, 2024, 2025 and 2026. Choose another year under **Compare elections** to calculate an actual published-vote comparison. Same-year comparisons are excluded from the school-board selector; the nearest earlier year is the default when available. The app also opens the verified November 2024/2022 D/R races, explicitly labeled as two-party archives rather than full candidate totals. Election and race selections are shareable in the page URL. Returning to November 2026 restores the separate live view; archived results never enter the live database or collection lifecycle.

The school archives include all candidates and write-ins, plus each separately published absentee/central unit. For April 2024/2025, the county CSV omits absentee, so a separate ABSENTEE unit uses the XML's explicit `AbsenteeVotes` field, never a residual. Every candidate sum must then match the XML `TotalVotes`. April 2026 uses the reconciled fixture pair. April 2023 is extracted from the [certified PDF](https://sccmo.org/Archive.aspx?ADID=4928), checks all eight candidate headers, and reconciles every candidate sum, including write-ins and special units, with the printed total.

2023 slate definitions are checked against [published contemporary endorsements](https://francishowellfamilies.org/we-must-be-doing-something-right/) and the [county Republican committee's endorsements](https://stcharlesgop.com/sccrcc-endorses-candidates-for-2023-board-of-education-election/): Forward's comparison slate is Doug Ziegemeier, Amy Easterling and Harry Harris; Families' slate is Jane Puszkar, Mark Ponder and Ron Harmon. Andrew Flett is excluded from slate share. A legacy cached race file conflicted with the original `slates.json` membership and is not used. 2023 boundary equivalence is unverified and the comparison carries an explicit caveat.

The selected election's raw candidate totals include its non-map units. Mapped-precinct comparisons still exclude those units and use only matched geographic precincts. Separately, an expandable non-geographic comparison reports matched ABSENTEE/CENTRAL accounting buckets where archived data exists. Consequently, a mapped comparison-panel share can differ from the raw countywide candidate share.

## Mobile usability

Phone and tablet layouts provide a bottom bar for Contests, Results, Compare and Map; a searchable contest drawer with an election selector, focus management and Escape dismissal; 44–48 px primary tap targets; 16 px select/input text; and safe-area spacing. County overview is collapsed initially on narrow screens. Phone precinct results are expandable cards rather than a wide table. A precinct selector and an in-flow detail card work without precise polygon taps. Map dragging and pinch gestures are opt-in on narrow screens so normal page scrolling remains available. Sources and detailed arithmetic stay in disclosures.

## Combined House and Senate views

The combined Missouri House, Missouri Senate and U.S. House views use the selected snapshot, so they update with live results and work with available general-election archives. They never pool candidates across districts or calculate a chamber-wide winner or swing. Every race retains its own candidates, reporting denominator, reporting-unit status and comparison. Only included races on the selected ballot are shown, not off-cycle seats or a full state/national chamber.

The county's 2026 file lists 11 Missouri House races across 115 geographic precinct IDs, two Missouri Senate races across 68, and two U.S. House races across 115. Respectively, 31, three and four precinct IDs appear in multiple contests. These are multi-district reporting entries, including zero-vote entries; they do not establish precise district geography. A striped polygon identifies such entries in every map mode. Selecting it displays every listed district separately. No area, vote, leader, reporting status or historical delta is inferred across those districts. The underlying shapes are precinct boundaries, not legislative boundaries.

The initial combined map shows within-race vote margins, with gray for precincts that have no published votes. An optional Districts mode colors district identities without implying a leader. Other modes show source reporting status, historical share or change. For non-split precincts, vote-margin colors are Democratic blue, Republican red and other candidates gold, with intensity by within-race margin. Split precincts stay striped even when different races report different leaders, statuses or changes. Absentee and central labels are selectable, but their separate per-race returns are never mapped or merged.

The collapsed comparison controls select a general-election year, precinct D/R race average versus same office/district, and D/R orientation. Each race uses the existing matched-precinct weighting and missing-data rules independently. Selecting a year does not invent a comparable same-office race where one is absent. No group aggregate is produced. Each race can be opened for its full historical methodology; a group CSV exports the original contest/unit/candidate rows exactly once per race.

## Directional precinct swing map

The election tracker has a separate **Swing map** tab for November 2026, using the existing verified county precinct polygons. Its markers are blue arrows pointing left when the Democratic two-party share increased from the selected 2024 baseline, and red arrows pointing right when Republican two-party share increased. Arrow size scales with the absolute percentage-point difference, capped visually; hover/click shows the numerical swing and race coverage. Unreported and historically unmatched precincts have no arrows.

- **Races eligible:** single-seat candidate contests with both explicit DEMOCRATIC and REPUBLICAN candidates; no propositions, judicial retention, unopposed races, third-party-only races, or school-board nonpartisan contests. Only St. Charles County precinct votes are included.
- **Current share:** Democratic votes divided by Democratic plus Republican votes in the selected 2026 race/precinct. The alternative two-party orientation is implied by its complement; arrows do not represent overall candidate margins.
- **2024 baseline:** the audited same-office 2024 share for that precinct when available. If an exact named office is not in the audited catalog, the audited 2024 equal-weight D/R race average for that precinct. The dropdown and instructions label this fallback clearly. This is a descriptive historical benchmark, not an assumption that voters or district membership are unchanged.
- **All-races setting:** compute the 2026 minus 2024 baseline swing separately for each eligible race that has positive two-party votes and a historical precinct baseline, then take the simple arithmetic mean of those race swings for each precinct. Each contest contributes equally regardless of turnout. Split/overlapping district precinct records are not combined as vote totals or extrapolated beyond their contested electorate. The number of contributing races varies by precinct and is shown in the table and tooltip.
- **Missingness and timing:** a zero-vote race contributes nothing to its precinct arrow. No historical benchmark means no contribution. Arrows appear as county results arrive and remain provisional until all results are reported. The underlying map cannot assign absentee, central or any other non-geographic reporting buckets to polygons.
- **Color and magnitude:** blue/left indicates a positive change in Democratic share; red/right a negative change. Approximately unchanged precincts display a neutral dot. This is not a representation of swing in election turnout or overall winner margin.

