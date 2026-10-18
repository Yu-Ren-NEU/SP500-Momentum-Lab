"""Add missing endpoints from an independently licensed historical snapshot.
Never overwrite an observed donor return just to reconcile a conflict.
"""
import csv
import datetime as dt
import io
import json
import math
import zipfile
from build_base import RAW, PUBLIC, ROOT, ALIASES, digest, merge, write_manifest
from update import atomic_json
from validate_public import validate_base

URL='https://www.kaggle.com/datasets/chickenrobot/historical-stocks-of-companies-of-the-sp-and-500'
IDENTITY_SOURCE='https://investors.tranetechnologies.com/news-and-events/news-releases/news-release-details/2020/Trane-Technologies-Completes-Reverse-Morris-Trust-Transaction-and-Begins-Trading-Today-on-NYSE/default.aspx'

def supplement():
    metadata=json.loads((RAW/'kaggle-2025-metadata.json').read_text())
    if metadata.get('licenseName')!='CC0: Public Domain':raise ValueError('Source license requires review')
    base=json.loads((PUBLIC/'stocks-base.json').read_text())
    targets={'2019-12-31':2019,'2020-12-31':2020,'2021-12-31':2021,'2022-12-30':2022,'2023-12-29':2023,'2024-12-31':2024}
    ends,previous,invalid={}, {}, set()
    with zipfile.ZipFile(RAW/'kaggle-2025-history.zip') as archive:
        with archive.open('Sp500_historical.csv') as raw:
            reader=csv.DictReader(io.TextIOWrapper(raw))
            for record in reader:
                date=record['Date'][:10]
                if date<'2019-01-01' or date>'2024-12-31':continue
                for symbol,cell in record.items():
                    if symbol=='Date' or not cell or '//' not in cell:continue
                    try:value=float(cell.split('//')[3])
                    except (ValueError,IndexError):continue
                    if not math.isfinite(value) or value<=0:continue
                    prev=previous.get(symbol)
                    if prev and abs(value/prev-1)>.5:invalid.add((symbol,int(date[:4])))
                    previous[symbol]=value
                    if date in targets:ends.setdefault(symbol,{})[targets[date]]=value
    audit_path=ROOT/'data/research/supplement-audit.json'
    previous_audit=json.loads(audit_path.read_text()) if audit_path.exists() else {}
    added,conflicts=previous_audit.get('added',[]),previous_audit.get('crossSourceConflicts',[])
    blocked={(r['year'],r['ticker']) for r in conflicts}
    with (RAW/'members.csv').open() as f:members=sorted(csv.DictReader(f),key=lambda r:r['date'])
    for year in (2020,2021,2022,2023,2024):
        key=str(year)
        cohort=set([r for r in members if r['date']<=key+'-12-31'][-1]['tickers'].split(','))
        if year==2020:
            # Replace the entire known-spliced donor year with one internally
            # consistent source, rather than mixing incompatible price scales.
            base['returns'][key]=[]
            base['rankings'][key]['rows']=[]
        annual=base['returns'][key]
        existing={r['id']:r for r in annual}
        ranking={r['id']:r for r in base['rankings'][key]['rows']}
        for symbol,prices in ends.items():
            if year not in prices or year-1 not in prices or (symbol,year) in invalid:continue
            ticker={'BRKB':'BRK.B','BFB':'BF.B'}.get(symbol,symbol)
            if symbol=='META' and year<2022:ticker='FB'
            identity='fnspid:'+ALIASES.get(ticker,ticker.replace('.','-'))
            value=prices[year]/prices[year-1]-1
            if year!=2020 and (year,ticker) in blocked:continue
            if identity in existing:
                if year in (2021,2022):continue
                difference=abs(value-existing[identity]['totalReturn'])
                if difference>.005:conflicts.append({'year':year,'ticker':ticker,'differencePercentagePoints':difference*100})
                continue
            row={'id':identity,'ticker':ticker,'name':ticker,'totalReturn':value,'source':'chickenrobot-close-ratio-adjustment-unverified'}
            # Quarantine flags belong to the rejected donor. Accepting another
            # source requires a clean independently checked daily path and exact
            # endpoints, while preserving the original immutable snapshots.
            if str(year) in base.get('quarantined',{}).get(symbol,{}):
                base['quarantined'][symbol].pop(str(year))
            annual.append(row);existing[identity]=row
            if ticker in cohort:ranking[identity]=row
            added.append({'year':year,'ticker':ticker,'inHistoricalYearEndUniverse':ticker in cohort})
        ordered=sorted(ranking.values(),key=lambda r:(-r['totalReturn'],r['id']))
        base['rankings'][key]['rows']=ordered;base['rankings'][key]['count']=len(ordered)
        base['coverage'][key]['available']=len(ordered)
        base['coverage'][key]['missing']=sorted(cohort-{r['ticker']for r in ordered})
    conflicts=list({(r['year'],r['ticker']):r for r in conflicts}.values())
    for conflict in conflicts:
        if conflict['year']==2020:
            conflict['resolution']='Use one consistent secondary donor for the known-spliced 2020 year; not a certified total-return series'
            continue
        key=str(conflict['year']);ticker=conflict['ticker']
        identity='fnspid:'+ALIASES.get(ticker,ticker.replace('.','-'))
        for section in ('rankings','returns'):
            rows=base[section][key]['rows'] if section=='rankings' else base[section][key]
            rows[:]=[r for r in rows if r['id']!=identity]
        rank=base['rankings'][key];rank['count']=len(rank['rows'])
        cov=base['coverage'][key];cov['available']=rank['count'];cov['missing']=sorted(set(cov['missing'])|{ticker})
        base.setdefault('quarantined',{}).setdefault(ticker,{})[key]=['cross-source conflict: '+str(conflict['differencePercentagePoints'])+' percentage points; excluded pending convention reconciliation']
    # The modern IR source splices into Gardner Denver in 2017. It cannot be
    # identified with pre-2020 Ingersoll-Rand plc by ticker alone.
    for year in (2017,2018,2019):
        key=str(year)
        for section in ('rankings','returns'):
            rows=base[section][key]['rows'] if section=='rankings' else base[section][key]
            rows[:]=[r for r in rows if r['id']!='fnspid:IR']
        rank=base['rankings'][key];rank['count']=len(rank['rows'])
        cov=base['coverage'][key];cov['available']=rank['count'];cov['missing']=sorted(set(cov['missing'])|{'IR'})
        base.setdefault('quarantined',{}).setdefault('IR',{})[key]=['identity: legacy Ingersoll-Rand plc versus Gardner Denver/new IR; ticker-reuse mapping unresolved; '+IDENTITY_SOURCE]
    source={'name':'Chickenrobot historical S&P stock snapshot, Kaggle version '+str(metadata['currentVersionNumber']),
            'url':URL,'license':'Uploader declares CC0: Public Domain; close adjustment undocumented; exploratory endpoint supplement only.',
            'licenseUrl':URL,'sha256':digest(RAW/'kaggle-2025-history.zip')}
    base['sources']=[s for s in base['sources'] if s['url']!=URL]+[source]
    base['limitations']=list(dict.fromkeys(base['limitations']+[
        '2020 uses one consistent secondary donor; missing 2021/2022/2023/2024 endpoints supplemented from Chickenrobot CC0 snapshot; close ratios, not certified total returns.',
        'IR 2017-2019 removed pending permanent-identity reconciliation: historical constituent IR and modern IR price history are different companies.',
        'Cross-source annual differences above 0.5 percentage points are quarantined until conventions are reconciled; donors are never averaged or silently substituted.'
    ]))
    result=merge({},base);validate_base(result)
    snapshot=PUBLIC/'base-versions'/(result['version']+'.json')
    if not snapshot.exists():atomic_json(snapshot,result,compact=True)
    atomic_json(PUBLIC/'stocks-base.json',result,compact=True);write_manifest(result)
    added=list({(r['year'],r['ticker']):r for r in added}.values())
    audit={'sourceUrl':URL,'sourceSha256':source['sha256'],'added':added,'crossSourceConflicts':conflicts,
           'identityQuarantine':{'ticker':'IR','years':[2017,2018,2019],'sourceUrl':IDENTITY_SOURCE},'baseVersion':result['version']}
    atomic_json(ROOT/'data/research/supplement-audit.json',audit)
    print(json.dumps({'version':result['version'],'added':len(added),'conflicts':len(conflicts),'coverage':{y:result['coverage'][y]['available']for y in ['2023','2024']}}))

if __name__=='__main__':supplement()
