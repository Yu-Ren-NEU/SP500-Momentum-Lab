"""Allow-list publication schema: no raw quotes, teaching records, or licensed stocks."""
import hashlib,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def validate(data):
    expected={'schemaVersion','updatedAt','completeThrough','version','sources','updateWarnings','benchmarks','nasdaqLastObservation','research','rankingEvidence'}
    if set(data)!=expected: raise ValueError('Unexpected public dataset keys: '+str(set(data)^expected))
    if data['schemaVersion']!=1: raise ValueError('Invalid schema')
    for key,start,basis in [('sp500',1958,'total_return'),('nasdaq',1972,'price_return')]:
        rows=data['benchmarks'][key]; years=sorted(map(int,rows))
        if not years or years!=list(range(start,max(years)+1)): raise ValueError('Missing benchmark year: '+key)
        for y,row in rows.items():
            r=row['return']
            if not isinstance(r,(int,float)) or isinstance(r,bool) or not math.isfinite(r) or r< -1: raise ValueError('Invalid return '+y)
            if row['basis']!=basis or row['source']!=('nyu' if key=='sp500' else 'nasdaq'): raise ValueError('Basis mismatch')
    if set(data['research'])!={'membershipEvidenceIntervals','membershipLastEndpoint','notes'}: raise ValueError('Teaching/security records must stay private')
    for s in data['sources'].values():
        for k in ('url','retrievedAt','sha256','rights','rightsUrl'):
            if not s.get(k): raise ValueError('Source provenance missing '+k)
    content={k:data[k] for k in ('schemaVersion','benchmarks','rankingEvidence')}
    version=hashlib.sha256(json.dumps(content,sort_keys=True).encode()).hexdigest()[:16]
    if data['version']!=version: raise ValueError('Content hash mismatch')
    return True
def validate_base(data):
    required={'schemaVersion','quality','redistribution','licenseEvidence','rankings','returns','coverage','sources','version','startYear','endYear'}
    if not required.issubset(data):raise ValueError('Stock base provenance missing')
    allowed=required|{'updatedAt','aliasNotes','quarantined','limitations','buildStats','partialListingPeriods'}
    if set(data)-allowed:raise ValueError('Unexpected fields in stock base')
    for key,period in data.get('partialListingPeriods',{}).items():
        if set(period)!={'from','to','source','note'} or not all(isinstance(v,str) and v for v in period.values()) or period['from']>=period['to'] or not period['source'].startswith('https://'):
            raise ValueError('Invalid listing period evidence')
    if data['quality']!='exploratory' or data['redistribution']!='permitted':raise ValueError('Private or unclassified stock data cannot be published')
    if not data['licenseEvidence'] or not data['sources']:raise ValueError('Publication permission evidence missing')
    for source in data['sources']:
        if not all(source.get(k)for k in ('name','url','license','licenseUrl','sha256')):raise ValueError('Source license/provenance missing')
    for section in ('rankings','returns'):
        for year,value in data[section].items():
            rows=value['rows']if section=='rankings'else value
            if not year.isdigit()or len(year)!=4:raise ValueError('Invalid year')
            if section=='rankings':
                if value['status']!='provisional' or value['universe']!='historical-members-available-sample' or value['asOf']!=year+'-12-31':raise ValueError('Unreviewed sample must be labeled provisional')
                cov=data['coverage'][year]
                if value['count']!=len(rows)or len(rows)<10 or cov['available']!=len(rows)or cov['members']<len(rows):raise ValueError('Coverage mismatch')
            seen=set()
            for row in rows:
                if set(row)!={'id','ticker','name','totalReturn','source'}:raise ValueError('Raw quotes or unexpected stock fields cannot be published')
                r=row['totalReturn']
                if not isinstance(r,(int,float))or isinstance(r,bool)or not math.isfinite(r)or r< -1:raise ValueError('Invalid stock return')
                if not all(isinstance(row[k],str)and row[k]for k in ('id','ticker','name','source'))or row['id']in seen:raise ValueError('Invalid or duplicate security identifier')
                seen.add(row['id'])
                symbol=row['id'].removeprefix('fnspid:')
                if year in data.get('quarantined',{}).get(symbol,{}):raise ValueError('Quarantined return leaked into sample')
    content={k:data[k]for k in ('quality','rankings','returns','coverage','sources')}
    version=hashlib.sha256(json.dumps(content,sort_keys=True).encode()).hexdigest()[:16]
    if data['version']!=version:raise ValueError('Stock snapshot hash mismatch')
    return True

def validate_ytd(data):
    import datetime as dt
    expected={'schemaVersion','kind','year','asOf','version','sourceUrl','sourceSha256','license','basis','returns'}
    if set(data)!=expected or data['kind']!='stocks-ytd' or data['schemaVersion']!=1:
        raise ValueError('Invalid YTD schema')
    cutoff=dt.date.fromisoformat(data['asOf'])
    if cutoff.year!=data['year'] or cutoff>dt.datetime.now(dt.timezone.utc).date():
        raise ValueError('Invalid YTD cutoff')
    if data['basis']!='close-ratio-adjustment-unverified' or not all(data[k] for k in ('sourceUrl','sourceSha256','license')):
        raise ValueError('YTD provenance or convention missing')
    seen=set()
    for row in data['returns']:
        if set(row)!={'id','ticker','name','totalReturn','source'} or row['id'] in seen:
            raise ValueError('Raw quote or duplicate YTD identity')
        seen.add(row['id'])
        r=row['totalReturn']
        if isinstance(r,bool) or not isinstance(r,(int,float)) or not math.isfinite(r) or r < -1:
            raise ValueError('Invalid YTD return')
    content={k:v for k,v in data.items() if k!='version'}
    if data['version']!=hashlib.sha256(json.dumps(content,sort_keys=True).encode()).hexdigest()[:16]:
        raise ValueError('YTD hash mismatch')
    return True

if __name__=='__main__':
    files=list((ROOT/'public/data/versions').glob('*.json'))+[ROOT/'public/data/public.json']
    for path in files:validate(json.loads(path.read_text()))
    bases=list((ROOT/'public/data/base-versions').glob('*.json'))
    if (ROOT/'public/data/stocks-base.json').exists():bases.append(ROOT/'public/data/stocks-base.json')
    for path in bases:validate_base(json.loads(path.read_text()))
    integrity=ROOT/'public/data/integrity.json'
    if integrity.exists():
        report=json.loads(integrity.read_text());base=json.loads((ROOT/'public/data/stocks-base.json').read_text())
        if report['baseVersion']!=base['version']:raise ValueError('Integrity audit is stale; rebuild the catalogue')
        if report['fullHistoricalCoverageVerified'] or report['verifiedFullUniverseYears']!=0:raise ValueError('Unreviewed completeness claim')
        for row in report['years']:
            if row['fullUniverseVerified']:raise ValueError('Unreviewed year-level completeness claim')
            coverage=base['coverage'].get(str(row['year']))
            if coverage and (row['observedMembers']!=coverage['available'] or row['sourceMemberCount']!=coverage['members']):raise ValueError('Integrity coverage mismatch')
    ytds=list((ROOT/'public/data/ytd-versions').glob('*.json'))
    if (ROOT/'public/data/stocks-ytd.json').exists():ytds.append(ROOT/'public/data/stocks-ytd.json')
    for path in ytds:validate_ytd(json.loads(path.read_text()))
    print(f'Validated {len(ytds)} YTD snapshots.')
    print(f'Validated {len(files)} index and {len(bases)} exploratory stock snapshots; private/raw data excluded.')
