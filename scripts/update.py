"""Fetch public benchmarks and teaching membership evidence; no paid-service login."""
import csv, datetime as dt, hashlib, io, json, os, re, tempfile, urllib.request, subprocess, argparse
from html.parser import HTMLParser
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT/'public/data'
RAW = ROOT/'data/raw'
RAW.mkdir(parents=True,exist_ok=True)
URLS = {
 'nyu': 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
 'nasdaq': 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQCOM',
 'wrds': 'https://wrds-www.wharton.upenn.edu/classroom/sp500-introduction/over-time/'
}
class Tables(HTMLParser):
 def __init__(self):
  super().__init__(); self.rows=[]; self.row=None; self.cell=None
 def handle_starttag(self, tag, attrs):
  if tag=='tr': self.row=[]
  if tag in ('td','th'): self.cell=[]
 def handle_data(self, data):
  if self.cell is not None: self.cell.append(data)
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   if self.row is not None: self.row.append(' '.join(''.join(self.cell).split()))
   self.cell=None
  if tag=='tr' and self.row is not None:
   self.rows.append(self.row); self.row=None

def parse_nyu(raw, last_year):
 p=Tables(); p.feed(raw.decode('utf-8',errors='replace')); out={}
 for row in p.rows:
  if len(row)>1 and re.fullmatch(r'\d{4}',row[0]) and re.fullmatch(r'-?\d+(\.\d+)?%',row[1]):
   year=int(row[0])
   if 1958<=year<=last_year: out[str(year)]={'return':float(row[1][:-1])/100,'source':'nyu','basis':'total_return'}
 if not out or '1958' not in out: raise ValueError('NYU table layout/coverage changed')
 years=sorted(map(int,out))
 if years!=list(range(1958,max(years)+1)): raise ValueError('NYU has a missing year')
 return out

def parse_nasdaq(raw, last_year):
 closes={}; daily=[]
 for row in csv.DictReader(io.StringIO(raw.decode())):
  date=row.get('observation_date') or row.get('DATE'); val=row.get('NASDAQCOM')
  if date and val and val!='.':
   value=float(val)
   if value<=0: raise ValueError('Nonpositive index')
   closes[int(date[:4])]=(date,value); daily.append({'date':date,'close':value})
 out={}
 for year in sorted(closes):
  if year<=last_year and year-1 in closes:
   a,b=closes[year-1],closes[year]
   if a[0][5:7]=='12' and b[0][5:7]=='12':
    out[str(year)]={'return':b[1]/a[1]-1,'source':'nasdaq','basis':'price_return','from':a[0],'to':b[0]}
 if '1972' not in out: raise ValueError('NASDAQ full-year coverage missing')
 return out,daily

def parse_wrds(raw):
 p=Tables(); p.feed(raw.decode('utf-8',errors='replace')); unique={}
 for r in p.rows:
  if len(r)==6 and r[0] in ('Added','Removed') and r[1].isdigit() and re.fullmatch(r'\d{4}-\d{2}-\d{2}',r[4]) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',r[5]):
   key=(r[1],r[4],r[5]); unique[key]={'permno':r[1],'name':r[2],'tickers':r[3],'start':r[4],'end':r[5]}
 return list(unique.values())

def atomic_json(path, value, compact=False):
 path.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',dir=path.parent,delete=False) as f:
  json.dump(value,f,ensure_ascii=False,indent=None if compact else 2,separators=(',',':') if compact else None,allow_nan=False); temp=f.name
 os.replace(temp,path)

def main():
 parser=argparse.ArgumentParser(); parser.add_argument('--offline',action='store_true'); args=parser.parse_args()
 now=dt.datetime.now(dt.timezone.utc); last_year=now.year-1; fetched={}; sources={}; errors={}
 for key,url in URLS.items():
  try:
   filename={'nyu':'nyu.html','nasdaq':'nasdaq.csv','wrds':'wrds.html'}[key]
   if args.offline:
    if key=='wrds': continue
    raw=(RAW/filename).read_bytes()
   else:
    raw=subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','10','--max-time','45',url],capture_output=True,check=True).stdout
   fetched[key]=raw
   sources[key]={'url':url,'retrievedAt':now.isoformat(),'sha256':hashlib.sha256(raw).hexdigest()}
   if key!='wrds': (ROOT/'data/raw'/('nyu.html' if key=='nyu' else 'nasdaq.csv')).write_bytes(raw)
  except Exception as e: errors[key]=str(e)
 previous=json.loads((PUBLIC/'public.json').read_text()) if (PUBLIC/'public.json').exists() else None
 if errors.get('nyu') or errors.get('nasdaq'):
  raise RuntimeError('Benchmark update aborted; previous public.json preserved: '+str(errors))
 sp=parse_nyu(fetched['nyu'],last_year); nas,daily=parse_nasdaq(fetched['nasdaq'],last_year)
 members=parse_wrds(fetched.get('wrds',b''))
 if not members and previous:
  members=[]
  if 'wrds' in previous['sources']: sources['wrds']=previous['sources']['wrds']
  errors['wrds']=errors.get('wrds','Login or changed layout; kept previous teaching evidence')
 # Do not retain complete WRDS HTML: external caches may contain unrelated page/session metadata.
 if members: atomic_json(ROOT/'data/raw/wrds-teaching-intervals.json',members)
 data={'updatedAt':now.isoformat(),'completeThrough':min(max(map(int,sp)),last_year),
 'sources':sources,'updateWarnings':errors,'benchmarks':{'sp500':sp,'nasdaq':nas},
 'nasdaqLastObservation':daily[-1]['date'],

 'rankingEvidence':[{'year':2023,'ticker':'NVDA','returnApprox':2.39,'scope':'Magnificent Seven best performer; not a certified full-universe ranking','source':'https://www.indexologyblog.com/2024/01/22/2023-market-review-for-asian-investors/','basis':'article rounded gain; dividend basis unspecified'}]}
 data['schemaVersion']=1
 data['research']={'membershipEvidenceIntervals':len(members) or (previous or {}).get('research',{}).get('membershipEvidenceIntervals',0),'membershipLastEndpoint':max((m['end'] for m in members),default=(previous or {}).get('research',{}).get('membershipLastEndpoint')),'notes':['Complete historical stock total returns and point-in-time universes for 1958-2025 remain unavailable; no certified full-universe strategy is asserted.','WRDS teaching change excerpts are not full constituent history; source pages and security records are not redistributed.','2026 is incomplete; YTD observations must remain separate from complete calendar-year returns.','A 1958 investment requires the 1957 ranking and point-in-time investability.']}
 sources['nyu'].update(rights='Attributed non-commercial research use; do not resell',rightsUrl='https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html')
 sources['nasdaq'].update(rights='Non-commercial educational/personal use only. Nasdaq copyrighted; no commercial redistribution. Annual derived returns only.',rightsUrl='https://fred.stlouisfed.org/legal/terms/')
 if 'wrds' in sources: sources['wrds'].update(rights='Metadata only; teaching data not distributed',rightsUrl='https://wrds-www.wharton.upenn.edu/pages/about/what-wrds/')
 # Dataset versions depend on financial content, not changing retrieval timestamps.
 content={k:data[k] for k in ('schemaVersion','benchmarks','rankingEvidence')}
 data['version']=hashlib.sha256(json.dumps(content,sort_keys=True).encode()).hexdigest()[:16]
 snapshot=PUBLIC/'versions'/(data['version']+'.json')
 if not snapshot.exists(): atomic_json(snapshot,data)
 atomic_json(PUBLIC/'public.json',data)
 print(json.dumps({'sp500Years':len(sp),'nasdaqYears':len(nas),'membershipEvidenceIntervals':len(members),'completeThrough':data['completeThrough'],'warnings':errors}))
if __name__=='__main__': main()
