"""Build a static exploratory base from FNSPID prices + historical memberships.
This is an available-sample proxy, NOT a certified full-universe/delisting-aware backtest.
"""
import argparse,csv,datetime as dt,hashlib,io,json,math,subprocess,zipfile
from pathlib import Path
from update import atomic_json
from validate_public import validate_base
ROOT=Path(__file__).resolve().parents[1];RAW=ROOT/'data/raw/base';PUBLIC=ROOT/'public/data'
SOURCES=[
    {'name':'FNSPID - Dong, Fan & Peng (2024)','url':'https://huggingface.co/datasets/Zihan1004/FNSPID','license':'CC BY-NC 4.0; non-commercial research; derived annual values, modified from adjusted-close data','licenseUrl':'https://github.com/Zdong104/FNSPID_Financial_News_Dataset/blob/main/LICENSE','download':'https://huggingface.co/datasets/Zihan1004/FNSPID/resolve/main/Stock_price/full_history.zip','file':'fnspid-prices.zip'},
    {'name':'fja05680/sp500 historical membership','url':'https://github.com/fja05680/sp500','license':'MIT; historical reconstruction, not official S&P data','licenseUrl':'https://github.com/fja05680/sp500/blob/master/LICENSE','download':'https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes%20(Updated).csv','file':'members.csv'}]
ALIASES={'META':'FB','BRK.B':'BRK-B','BF.B':'BF-B'}
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def merge(base,patch):
    """Patch whole validated years; omission never deletes baseline years."""
    if base and base.get('quality')!=patch.get('quality'):raise ValueError('Cannot merge unlike data quality tiers')
    out={**base,**patch}
    out["sources"]=list({s["url"]:s for s in base.get("sources",[])+patch.get("sources",[])}.values())
    for k in ('rankings','returns','coverage'):out[k]={**base.get(k,{}),**patch.get(k,{})}
    for y,r in patch.get('rankings',{}).items():
        if not r['rows'] or r['count']!=len(r['rows']) or patch['coverage'][y]['available']!=len(r['rows']):raise ValueError('Invalid year patch')
        if r['universe']!='historical-members-available-sample':raise ValueError('Universe mismatch')
    out['startYear']=min(map(int,out['rankings']));out['endYear']=max(map(int,out['returns']))
    content={k:out[k] for k in ('quality','rankings','returns','coverage','sources')}
    out['version']=hashlib.sha256(json.dumps(content,sort_keys=True).encode()).hexdigest()[:16]
    return out

def build():
    with (RAW/'members.csv').open() as f:members=sorted(csv.DictReader(f),key=lambda r:r['date'])
    # A market calendar prevents 2023-12-28 snapshots masquerading as complete 2023.
    ends={}
    with (ROOT/'data/raw/nasdaq.csv').open() as f:
        for r in csv.DictReader(f):
            date=r.get('observation_date') or r.get('DATE');v=r.get('NASDAQCOM')
            if date and v and v!='.' and date[5:7]=='12':ends[int(date[:4])]=date
    last=dt.datetime.now(dt.timezone.utc).year-1
    cohorts={}
    for y in range(1996,last+1):
        eligible=[r for r in members if r['date']<=f'{y}-12-31']
        if eligible:cohorts[y]=set(eligible[-1]['tickers'].split(','))
    needed={ALIASES.get(t,t.replace('.','-'))for cohort in cohorts.values() for t in cohort}
    closing={};bad=0;files=0;quarantined={}
    dates=set(ends.values())
    with zipfile.ZipFile(RAW/'fnspid-prices.zip') as z:
        for info in z.infolist():
            if info.is_dir() or info.filename.startswith('__MACOSX/') or not info.filename.endswith('.csv'):continue
            ticker=Path(info.filename).stem.upper()
            if ticker not in needed:continue
            files+=1; values={};observations=[]
            with z.open(info) as raw,io.TextIOWrapper(raw,encoding='utf-8-sig') as f:
                reader=csv.DictReader(f)
                if 'adj close' not in (reader.fieldnames or []):continue
                for row in reader:
                    date=row['date'][:10]
                    try:value=float(row['adj close'])
                    except (ValueError,KeyError):bad+=1;continue
                    if not math.isfinite(value) or value<=0:bad+=1;continue
                    observations.append((date,value))
                    if date in dates:values[int(date[:4])]=value
            observations.sort()
            invalid={}
            for (d0,p0),(d1,p1) in zip(observations,observations[1:]):
                change=p1/p0-1
                if abs(change)>.5 and not (ticker=='THC' and d1=='2010-12-10' and .54 < change < .56):
                    invalid.setdefault(d1[:4],[]).append(d1+': adjusted-close change '+str(round(change*100,2))+'%; unverified discontinuity')
            if ticker=='IR':
                for year in ('2017','2018','2019'):invalid.setdefault(year,[]).append('identity: old Ingersoll-Rand plc versus Gardner Denver/new IR; historical mapping unresolved')
            if invalid:quarantined[ticker]=invalid
            closing[ticker]=values
    rankings={};coverage={};annual={}
    for y,cohort in cohorts.items():
        rows=[];missing=[]
        for ticker in sorted(cohort):
            symbol=ALIASES.get(ticker,ticker.replace('.','-'));prices=closing.get(symbol,{})
            if y not in prices or y-1 not in prices or str(y) in quarantined.get(symbol,{}):missing.append(ticker);continue
            r=prices[y]/prices[y-1]-1
            if not math.isfinite(r) or r< -1:missing.append(ticker);continue
            item={'id':'fnspid:'+symbol,'ticker':ticker,'name':ticker,'totalReturn':r,'source':'fnspid-adjusted-close'}
            rows.append(item)
        # A weak/partial year is still recorded in coverage, never certified.
        coverage[str(y)]={'members':len(cohort),'available':len(rows),'missing':missing}
        if len(rows)<10:continue
        rows.sort(key=lambda r:(-r['totalReturn'],r['id']))
        rankings[str(y)]={'status':'provisional','asOf':f'{y}-12-31','universe':'historical-members-available-sample','source':'fnspid + fja05680 historical snapshot','count':len(rows),'rows':rows}
        # Holdings are required even if they exit the index during their holding year.
        returns=[]
        for symbol,prices in closing.items():
            if y in prices and y-1 in prices and str(y) not in quarantined.get(symbol,{}):returns.append({'id':'fnspid:'+symbol,'ticker':symbol,'name':symbol,'totalReturn':prices[y]/prices[y-1]-1,'source':'fnspid-adjusted-close'})
        annual[str(y)]=returns
    if not rankings:raise ValueError('No usable full calendar-year endpoints found')
    quarantined={symbol:{year:notes for year,notes in flags.items() if year in rankings} for symbol,flags in quarantined.items()}
    sourceMeta=[{k:v for k,v in s.items() if k not in ('download','file')}|{'sha256':digest(RAW/s['file'])}for s in SOURCES]
    return {'schemaVersion':1,'quality':'exploratory','redistribution':'permitted','licenseEvidence':'FNSPID CC BY-NC 4.0; fja05680 MIT. Derived non-commercial research sample; see sources. Not official index data.','updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'sources':sourceMeta,'rankings':rankings,'returns':annual,'coverage':coverage,'aliasNotes':ALIASES,'quarantined':quarantined,'limitations':['Available-sample ranking, not complete S&P 500 top ten.','Possible survivorship, ticker-recycling, corporate-action and delisting gaps.','Adjusted close is a return proxy, not verified CRSP total return.','Both year-end trading dates required; no partial calendar-year substitution.','Any observed adjacent adjusted-close move above 50% in absolute value quarantines that security-year pending review. Genuine extreme moves may also be excluded.'],'buildStats':{'filesRead':files,'invalidRows':bad,'quarantinedSecurityYears':sum(len(v)for v in quarantined.values())}}

def write_manifest(data):
    atomic_json(PUBLIC/'base-latest.json', {'kind':'stocks-base-manifest','version':data['version'],'startYear':data['startYear'],'endYear':data['endYear']})

def main():
    p=argparse.ArgumentParser();p.add_argument('--download',action='store_true');p.add_argument('--patch',type=Path);args=p.parse_args();RAW.mkdir(parents=True,exist_ok=True)
    if args.download:
        for s in SOURCES:
            subprocess.run(['curl','--location','--fail','--retry','1','--max-time','900','--output',str(RAW/s['file']),s['download']],check=True)
    patch=json.loads(args.patch.read_text())if args.patch else build();file=PUBLIC/'stocks-base.json';old=json.loads(file.read_text())if file.exists()else{}
    data=merge(old,patch);validate_base(data);snapshot=PUBLIC/'base-versions'/(data['version']+'.json')
    if not snapshot.exists():atomic_json(snapshot,data,compact=True)
    atomic_json(file,data,compact=True)
    write_manifest(data)
    print(json.dumps({'version':data['version'],'signalYears':[min(data['rankings']),max(data['rankings'])],'returnThrough':data['endYear'],'bytes':file.stat().st_size,'firstCoverage':data['coverage'][min(data['rankings'])]}))
if __name__=='__main__':main()
