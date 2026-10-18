"""Rebuild a local price-only sample from raw Close, never dividend-adjusted Close.
Yahoo observations are local-only pending redistribution review. Old snapshots stay intact.
"""
import argparse
import concurrent.futures as cf
import csv, datetime as dt, hashlib, io, json, math, urllib.request, urllib.parse, zipfile
from pathlib import Path
from build_base import ROOT, RAW, PUBLIC, ALIASES, digest, merge
from update import atomic_json
CUTOFF=json.loads((PUBLIC/'stocks-ytd.json').read_text())['asOf']
YEAR=int(CUTOFF[:4])
CACHE=ROOT/'data/raw/price-only'/CUTOFF


def fetch(symbol, daily=False, start='1995-01-01'):
    path=CACHE/(symbol.replace('/','_')+('-daily-'+start if daily else '')+'.json')
    if path.exists(): return json.loads(path.read_text())
    end=dt.date.fromisoformat(CUTOFF)+dt.timedelta(days=1)
    p1=int(dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc).timestamp())
    p2=int(dt.datetime.combine(end,dt.time(),dt.timezone.utc).timestamp())
    query=urllib.parse.urlencode({'period1':p1,'period2':p2,'interval':'1d' if daily else '1mo','events':'splits'})
    url='https://query1.finance.yahoo.com/v8/finance/chart/'+urllib.parse.quote(symbol,safe='')+'?'+query
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    raw=urllib.request.urlopen(request,timeout=18).read()
    data=json.loads(raw)
    if not data['chart']['result']: raise ValueError('No price observations')
    path.write_bytes(raw)
    return data

def observations(data):
    r=data['chart']['result'][0]
    return r,[(dt.datetime.fromtimestamp(t,dt.timezone.utc).date().isoformat(),v)
              for t,v in zip(r['timestamp'],r['indicators']['quote'][0]['close'])
              if isinstance(v,(int,float)) and math.isfinite(v) and v>0]

def annual_return(before, after):
    if not all(math.isfinite(v) and v>0 for v in (before,after)):raise ValueError('Invalid price')
    return after/before-1

def period_start(values,year,source,previous_source,listing):
    if year-1 in values and previous_source == source:
        return values[year-1], None
    if listing and listing[0][:4] == str(year):
        return listing[1], listing[0]
    return None, None

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--retry-failed',action='store_true')
    args=parser.parse_args()
    CACHE.mkdir(parents=True,exist_ok=True)
    failure_path=CACHE/'_failures.json'
    previous_failures=json.loads(failure_path.read_text()) if failure_path.exists() and not args.retry_failed else {}
    old=json.loads((PUBLIC/'stocks-base.json').read_text())
    with (RAW/'members.csv').open() as f:members=sorted(csv.DictReader(f),key=lambda r:r['date'])
    cohorts={y:set([r for r in members if r['date']<=f'{y}-12-31'][-1]['tickers'].split(',')) for y in range(1996,YEAR)}
    needed={ALIASES.get(t,t.replace('.','-')) for cohort in cohorts.values() for t in cohort}
    ends={}
    with (ROOT/'data/raw/nasdaq.csv').open() as f:
        for row in csv.DictReader(f):
            date=row.get('observation_date') or row.get('DATE')
            if date[5:7]=='12' and row['NASDAQCOM'] not in ('','.'):ends[int(date[:4])]=date
    # FNSPID Close is split-adjusted price; Adj Close is deliberately not read.
    prices={}; donors={}; failures={}; listing={}; names={}; raw_bad=set()
    with zipfile.ZipFile(RAW/'fnspid-prices.zip') as archive:
        for info in archive.infolist():
            symbol=Path(info.filename).stem.upper()
            if symbol not in needed or '__MACOSX' in info.filename or not info.filename.endswith('.csv'):continue
            observed=[]
            with archive.open(info) as raw:
                for row in csv.DictReader(io.TextIOWrapper(raw)):
                    date=row['date'][:10];year=int(date[:4])
                    try:value=float(row['close'])
                    except (ValueError,KeyError):continue
                    if math.isfinite(value) and value>0:
                        observed.append((date,value))
                        if date==ends.get(year):prices.setdefault(symbol,{})[year]=value;donors[(symbol,year)]='fnspid-split-adjusted-close'
            observed.sort()
            for (d0,p0),(d1,p1) in zip(observed,observed[1:]):
                change=p1/p0-1
                if abs(change)>.5 and not (symbol=='THC' and d1=='2010-12-10' and .54<change<.56):raw_bad.add((symbol,int(d1[:4])))
    # Download every observed historical member, including former members when resolvable.
    symbols=sorted(needed|{'SNDK'})
    def download(symbol):
        if symbol in previous_failures:return symbol,None,previous_failures[symbol]
        yahoo={'FB':'META','BRK-B':'BRK-B','BF-B':'BF-B'}.get(symbol,symbol)
        try:
            data=fetch(yahoo);meta,rows=observations(data)
            if not rows:raise ValueError('Empty prices')
            first=dt.datetime.fromtimestamp(meta['meta']['firstTradeDate'],dt.timezone.utc).date().isoformat()
            ipo=None
            if first[:4]>='1996':
                daily=fetch(yahoo,True,first[:4]+'-01-01');_,ds=observations(daily)
                ds=[(d,v) for d,v in ds if d[:4]==first[:4]]
                if ds and abs((dt.date.fromisoformat(ds[0][0])-dt.date.fromisoformat(first)).days)<=7:ipo=ds[0]
            # Monthly bars may include later observations in an unfinished month.
            # Use daily closes for the exact YTD cutoff, never the current monthly bar.
            current_rows = []
            if symbol in {ALIASES.get(t,t.replace('.','-')) for t in cohorts[YEAR-1]}:
                _, current_rows = observations(fetch(yahoo,True,f'{YEAR-1}-12-01'))
                current_rows = [(d,v) for d,v in current_rows if d <= CUTOFF]
                if not current_rows or current_rows[-1][0] != CUTOFF:
                    current_rows = []
            return symbol,(meta,rows,ipo,current_rows),None
        except Exception as e:return symbol,None,type(e).__name__+': '+str(e)
    completed=0
    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        for symbol,result,error in pool.map(download,symbols):
            completed+=1
            if error:failures[symbol]=error
            else:
                meta,rows,ipo,current_rows=result;names[symbol]=meta['meta'].get('longName',symbol)
                for date,value in rows:
                    year=int(date[:4])
                    if date[5:7]=='12' and year<YEAR:
                        prices.setdefault(symbol,{})[year]=value;donors[(symbol,year)]='yahoo-split-adjusted-close-local'
                if current_rows:
                    prices.setdefault(symbol,{})[YEAR]=current_rows[-1][1];donors[(symbol,YEAR)]='yahoo-split-adjusted-close-local'
                if ipo:listing[symbol]=ipo
            if completed%100==0:print(f'Processed {completed}/{len(symbols)} symbols',flush=True)
    atomic_json(failure_path,failures)
    annual={};rankings={};coverage={};partial={};holding_gaps=[]
    for year in range(1996,YEAR+1):
        rows=[]
        for symbol,values in prices.items():
            if year not in values:continue
            source=donors[(symbol,year)]
            if source.startswith('fnspid') and ((symbol,year) in raw_bad or str(year) in old.get('quarantined',{}).get(symbol,{})):continue
            if symbol=='IR' and year in (2017,2018,2019):continue
            before, listing_date = period_start(values,year,source,donors.get((symbol,year-1)),listing.get(symbol))
            if before is None:continue
            if listing_date:partial[f'{year}:{symbol}']={'from':listing_date,'to':ends.get(year,CUTOFF),'source':'Yahoo firstTradeDate matched to first daily close'}
            ticker={'FB':'META' if year>=2022 else 'FB','BRK-B':'BRK.B','BF-B':'BF.B'}.get(symbol,symbol)
            rows.append({'id':'fnspid:'+symbol,'ticker':ticker,'name':names.get(symbol,ticker),
                         'totalReturn':annual_return(before,values[year]),'source':source})
        annual[str(year)]=rows
        if year==YEAR:continue
        cohort=cohorts[year]
        ordered=sorted([r for r in rows if r['ticker'] in cohort],key=lambda r:(-r['totalReturn'],r['id']))
        if len(ordered)<10:continue
        rankings[str(year)]={'status':'provisional','asOf':f'{year}-12-31','universe':'historical-members-available-sample','source':'Split-adjusted Close only; local research sample','count':len(ordered),'rows':ordered}
        coverage[str(year)]={'members':len(cohort),'available':len(ordered),'missing':sorted(cohort-{r['ticker'] for r in ordered})}
    sources=[{'name':'FNSPID raw Close (split-adjusted, dividends excluded)','url':'https://huggingface.co/datasets/Zihan1004/FNSPID','license':'CC BY-NC 4.0; non-commercial derived research','licenseUrl':'https://github.com/Zdong104/FNSPID_Financial_News_Dataset/blob/main/LICENSE','sha256':digest(RAW/'fnspid-prices.zip')},
        {'name':'Yahoo Finance Close, local research only','url':'https://finance.yahoo.com/','license':'Redistribution permission unestablished; excluded from public builds','licenseUrl':'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html','sha256':hashlib.sha256(''.join(sorted(p.name+digest(p) for p in CACHE.glob('*.json'))).encode()).hexdigest()}]
    base=merge({},dict(schemaVersion=1,quality='exploratory',redistribution='local-only',licenseEvidence='Local research only; price donor redistribution review pending',rankings=rankings,returns={k:v for k,v in annual.items() if int(k)<YEAR},coverage=coverage,sources=sources))
    base.update(basis='split_adjusted_price_return',partialListingPeriods=partial,quarantined={},limitations=['Incomplete historical member sample; no complete-universe claim','Corporate distributions and delisting proceeds are excluded or missing; missing holdings stop the curve','Ticker identity mapping remains provisional'],updatedAt=dt.datetime.now(dt.timezone.utc).isoformat())
    ytd={'schemaVersion':1,'kind':'stocks-ytd','year':YEAR,'asOf':CUTOFF,'returns':annual[str(YEAR)],'basis':'split_adjusted_price_return'}
    ytd['version']=hashlib.sha256(json.dumps(ytd,sort_keys=True).encode()).hexdigest()[:16]
    for y,rank in rankings.items():
        nxt=annual.get(str(int(y)+1),[]);ids={r['id']for r in nxt}
        holding_gaps.extend({'signalYear':int(y),'holdingYear':int(y)+1,'rank':i+1,'ticker':r['ticker']} for i,r in enumerate(rank['rows'][:10]) if r['id'] not in ids)
    audit={'basis':base['basis'],'baseVersion':base['version'],'failedDownloads':failures,'partialListingPeriods':partial,'holdingGaps':holding_gaps,'yearCoverage':coverage,'fullUniverseVerified':False,'newListingEvidence':{'SNDK':'https://www.sec.gov/Archives/edgar/data/2023554/000202355425000034/sndk-20250627.htm'}}
    for year, rank in rankings.items():
        assert rank['count'] == len(rank['rows']) == coverage[year]['available']
        assert rank['rows'] == sorted(rank['rows'],key=lambda r:(-r['totalReturn'],r['id']))
        assert len({r['id'] for r in rank['rows']}) == len(rank['rows'])
        assert all(math.isfinite(r['totalReturn']) and r['totalReturn'] >= -1 for r in rank['rows'])
    assert ytd['returns'] and all(r['source']=='yahoo-split-adjusted-close-local' for r in ytd['returns'])
    atomic_json(PUBLIC/'stocks-price.local.json',base,compact=True)
    atomic_json(PUBLIC/'stocks-price-ytd.local.json',ytd,compact=True)
    atomic_json(PUBLIC/'price-integrity.local.json',audit)
    print(json.dumps({'version':base['version'],'years':len(rankings),'failedDownloads':len(failures),'holdingGaps':len(holding_gaps),'latestSignalTop3':[(r['ticker'],r['totalReturn']) for r in rankings[str(YEAR-1)]['rows'][:3]]}),flush=True)

if __name__=='__main__':main()
