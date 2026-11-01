#!/usr/bin/env python3
"""Build audited, geographic-only benchmarks. Requires pdftotext (Poppler).
Downloads are cached under ignored work/history. Never used by the live adapter.
"""
import csv, hashlib, io, json, re, subprocess, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; CACHE=ROOT/'work/history'; CACHE.mkdir(parents=True,exist_ok=True)
SOURCES={
 '2022': 'https://www.sccmo.org/ArchiveCenter/ViewFile/Item/4877',
 '2024': 'https://www.sccmo.org/DocumentCenter/View/25818/SOVC_OFFICIAL-Nov-2024',
}
NS={'h':'http://www.w3.org/1999/xhtml'}
def download(url, path):
 if not path.exists():
  req=urllib.request.Request(url,headers={'User-Agent':'STCC public election history audit'})
  path.write_bytes(urllib.request.urlopen(req).read())
 return path

def pdf_races(year):
 path=download(SOURCES[year],CACHE/f'official-{year}.pdf'); bbox=CACHE/f'official-{year}-bbox.html'
 subprocess.run(['pdftotext','-bbox-layout',str(path),str(bbox)],check=True)
 races={}; pages=ET.parse(bbox).findall('.//h:page',NS)
 for page_no,page in enumerate(pages,1):
  words=page.findall('.//h:word',NS)
  party={p: [w for w in words if w.text==f'({p})' and float(w.get('yMin'))<170] for p in ['REP','DEM']}
  if not all(len(v)==1 for v in party.values()): continue # unopposed/ambiguous parties excluded
  title=' '.join(w.text for w in sorted(words,key=lambda w:(float(w.get('yMin')),float(w.get('xMin')))) if 85<float(w.get('yMin'))<131 and float(w.get('xMin'))>=188 and w.text!='Turnout')
  if not title: raise ValueError(f'No race title: {year} page {page_no}')
  race=races.setdefault(title,{'name':title,'units':{},'totals':None,'pages':[]})
  race['pages'].append(page_no)
  totals=[w for w in words if w.text=='Total' and 130<float(w.get('yMin'))<165]
  if len(totals)!=1:raise ValueError('Ambiguous total column')
  first=float(totals[0].get('xMin'))+33
  starts={p:first+66*int((float(ws[0].get('xMin'))-first+1)//66) for p,ws in party.items()}
  ids=[w for w in words if float(w.get('xMin'))<50 and float(w.get('yMin'))>160 and (re.fullmatch(r'\d{3}',w.text or '') or w.text in ['Total','ABSENTEE','CENTRAL'])]
  for label in ids:
   y=float(label.get('yMin')); row=[w for w in words if abs(float(w.get('yMin'))-y)<1]
   pair=[]
   for p in ['DEM','REP']:
    # Vote cells occupy first 33 pt of each 66 pt candidate column. Percent follows.
    cells=[w.text for w in row if starts[p]-1<=float(w.get('xMin'))<starts[p]+33 and re.fullmatch(r'\d+',w.text or '')]
    if len(cells)!=1: raise ValueError(f'Ambiguous cell {year} {title} {label.text} {p}: {cells}')
    pair.append(int(cells[0]))
   pid=label.text
   if pid=='CENTRAL':
    tail=[w.text for w in row if 50<float(w.get('xMin'))<150]; pid+=' '+' '.join(tail)
   if pid=='Total':
    if race['totals'] is not None: raise ValueError('Duplicate totals')
    race['totals']=pair
   else:
    if pid in race['units']: raise ValueError(f'Duplicate precinct {title} {pid}')
    race['units'][pid]=pair
 for name,r in races.items():
  if r['totals'] is None: raise ValueError(f'Missing total {name}')
  sums=[sum(v[i] for v in r['units'].values()) for i in [0,1]]
  if sums!=r['totals']: raise ValueError(f'PDF sums do not reconcile {year} {name}: {sums} vs {r["totals"]}')
  r['units']={p:v for p,v in r['units'].items() if p.isdigit()}
  if not any(v[0] for v in r['units'].values()) or not any(v[1] for v in r['units'].values()): raise ValueError('Non-contested race')
 if year=='2024':
  base='https://www.livevoterturnout.com/ENR/stcharlesmoenr/29/'
  geometry=download(base+'stcharlesmoenr_29.txt',CACHE/'geometry-29.json')
  if hashlib.sha256(geometry.read_bytes()).hexdigest()!='54129bd9046795838ce5990bc8acfbf6540f214512b805cca66cacec12d71e85':raise ValueError('General boundary change')
  csvpath=download(base+'Precincts_29.csv',CACHE/'precincts-29.csv')
  xmlpath=download(base+'summary_29.xml',CACHE/'summary-29.xml')
  parties={}
  for t in ET.parse(xmlpath).findall('Table'):
   party=t.findtext('Party','')
   if party in ['DEMOCRATIC PARTY','REPUBLICAN PARTY']:parties[(t.findtext('RaceName'),t.findtext('ContestantName'))]=0 if party.startswith('DEM') else 1
  csvrows=list(csv.reader(io.StringIO(csvpath.read_text(encoding='utf-8-sig')))); start=next(i for i,r in enumerate(csvrows) if r[:2]==['Precinct','Contest Name'])
  audited=set()
  for row in csvrows[start+1:]:
   pid,race,candidate,votes,*_=row
   if pid.isdigit() and race in races and (race,candidate) in parties:
    idx=parties[race,candidate]
    if (race,pid,idx) in audited:raise ValueError('Duplicate general CSV cell')
    audited.add((race,pid,idx))
    if races[race]['units'][pid][idx]!=int(votes):raise ValueError(f'PDF/CSV disagreement {race} {pid}')
  expected=sum(len(r['units'])*2 for r in races.values())
  if len(audited)!=expected:raise ValueError('Incomplete PDF/CSV cross-check')
  print(f'2024 PDF/CSV independently agree on {expected} geographic D/R cells')
 return {'year':year,'source':SOURCES[year],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'boundaryMatch':year=='2024','races':list(races.values())}

def school(year,source_id):
 base=f'https://www.livevoterturnout.com/ENR/stcharlesmoenr/{source_id}/'
 fixture=ROOT/'tests/fixtures'
 xml=fixture/f'summary-{source_id}.xml' if source_id==31 else download(base+f'summary_{source_id}.xml',CACHE/f'summary-{source_id}.xml')
 csvpath=fixture/f'precincts-{source_id}.csv' if source_id==31 else download(base+f'Precincts_{source_id}.csv',CACHE/f'precincts-{source_id}.csv')
 rows=list(csv.reader(io.StringIO(csvpath.read_text(encoding='utf-8-sig')))); start=next(i for i,r in enumerate(rows) if r[:2]==['Precinct','Contest Name'])
 name='FRANCIS HOWELL R-III SCHOOL BOARD MEMBER'; slates=json.loads((ROOT/'data/school-slates.json').read_text())['slates'][year]
 names=[slates['fh_forward']['candidates'],slates['fh_families']['candidates']]; units={}; seen=set()
 norm=lambda s:re.sub(r'\s+',' ',s.replace("\\'","'")).strip().upper()
 for row in rows[start+1:]:
  pid,race,candidate,votes,*_=row
  if norm(race)!=name:continue
  candidate=norm(candidate)
  if candidate not in names[0]+names[1]:continue
  if (pid,candidate) in seen:raise ValueError('Duplicate school cell')
  seen.add((pid,candidate)); idx=0 if candidate in names[0] else 1
  units.setdefault(pid,[0,0])[idx]+=int(votes)
 for pid in units:
  if any((pid,candidate) not in seen for candidate in names[0]+names[1]):raise ValueError(f'Missing slate candidate {pid}')
 # Historical CSVs omit absentee; no residual is assigned to a geographic precinct.
 summary=ET.fromstring(xml.read_text(encoding='utf-8-sig')); official={}
 for table in summary.findall('Table'):
  if norm(table.findtext('RaceName',''))==name:official[norm(table.findtext('ContestantName',''))]=int(table.findtext('TotalVotes'))
 for candidate in names[0]+names[1]:
  count=sum(int(r[3]) for r in rows[start+1:] if norm(r[1])==name and norm(r[2])==candidate)
  if count>official[candidate] or (source_id==31 and count!=official[candidate]):raise ValueError(f'School sum mismatch {candidate}')
 geometry=download(base+f'stcharlesmoenr_{source_id}.txt',CACHE/f'geometry-{source_id}.json')
 expected='54129bd9046795838ce5990bc8acfbf6540f214512b805cca66cacec12d71e85'
 if hashlib.sha256(geometry.read_bytes()).hexdigest()!=expected:raise ValueError('School boundary change')
 return {'year':year,'source':base+f'en/Index_{source_id}.html','csvSha256':hashlib.sha256(csvpath.read_bytes()).hexdigest(),'xmlSha256':hashlib.sha256(xml.read_bytes()).hexdigest(),'candidates':{'progressive':names[0],'conservative':names[1]},'units':{p:v for p,v in units.items() if p.isdigit()}}

if __name__=='__main__':
 result={'schemaVersion':1,'general':[pdf_races(y) for y in ['2024','2022']],'school':[school(y,n) for y,n in [('2026',31),('2025',30),('2024',27)]]}
 out=ROOT/'public/data/historical-benchmarks.json';out.write_text(json.dumps(result,separators=(',',':'))+'\n')
 print(f'Wrote {out} ({out.stat().st_size:,} bytes)')
 for g in result['general']:print(g['year'],len(g['races']),'contested races; sums reconcile including separately excluded special units')
 for s in result['school']:print(s['year'],len(s['units']),'school precincts')
