"""Publish a fail-closed coverage audit without claiming historical completeness."""
import csv
import datetime as dt
import json
from pathlib import Path
from update import atomic_json
ROOT=Path(__file__).resolve().parents[1]

def build():
    base=json.loads((ROOT/'public/data/stocks-base.json').read_text())
    ytd_path=ROOT/'public/data/stocks-ytd.json'
    ytd=json.loads(ytd_path.read_text()) if ytd_path.exists() else {}
    supplemental=ROOT/'data/research/supplement-audit.json'
    review=json.loads(supplemental.read_text()) if supplemental.exists() else {}
    gaps=[];years=[]
    for year in range(1958,dt.datetime.now(dt.timezone.utc).year+1):
        rank=base['rankings'].get(str(year));coverage=base['coverage'].get(str(year),{})
        next_year=year+1
        holding_rows=base['returns'].get(str(next_year),ytd.get('returns',[]) if next_year==ytd.get('year') else [])
        available={r['id'] for r in holding_rows}
        holdings=[]
        for position,row in enumerate(rank['rows'][:10] if rank else [],1):
            complete=row['id'] in available
            holdings.append({'rank':position,'ticker':row['ticker'],'available':complete,'holdingYear':next_year,
                             'period':'ytd' if next_year==ytd.get('year') else 'calendar-year'})
            if not complete:gaps.append({'signalYear':year,'holdingYear':next_year,'rank':position,'ticker':row['ticker'],'reason':'No validated holding return; not zero-filled'})
        is_ytd=year==ytd.get('year')
        years.append({'year':year,'status':'available-ytd-sample' if is_ytd else 'available-annual-sample' if rank else 'missing',
                      'fullUniverseVerified':False,'observedMembers':len(ytd.get('returns',[])) if is_ytd else coverage.get('available',0),'sourceMemberCount':coverage.get('members'),
                      'missingMemberCount':len(coverage.get('missing',[])) if coverage else None,'nextYearTop10Holdings':holdings})
    result={'schemaVersion':1,'baseVersion':base['version'],'ytdVersion':ytd.get('version'),
            'fullHistoricalCoverageVerified':False,'verifiedFullUniverseYears':0,'annualSampleYears':len(base['rankings']),
            'currentYearAsOf':ytd.get('asOf'),'years':years,'holdingGaps':gaps,
            'crossSourceConflicts':[r for r in review.get('crossSourceConflicts',[]) if not r.get('resolution')],
            'resolvedSourceDisagreements':[r for r in review.get('crossSourceConflicts',[]) if r.get('resolution')],
            'identityQuarantines':[review['identityQuarantine']] if review.get('identityQuarantine') else [],
            'limitations':['An available-sample ranking is not a verified full-universe top ten.','Successful arithmetic does not verify prices, dividends, identity or delisting outcomes.','Missing years and holdings remain explicit; no completeness claim is made.']}
    atomic_json(ROOT/'public/data/integrity.json',result)
    target=ROOT/'docs/HOLDING-GAPS.csv'
    with target.open('w') as f:
        fields=['signalYear','holdingYear','rank','ticker','reason'];w=csv.DictWriter(f,fields);w.writeheader();w.writerows(gaps)
    print(json.dumps({'sampleYears':len(base['rankings']),'unavailableTop10HoldingRecords':len(gaps),'conflicts':len(result['crossSourceConflicts'])}))
    return result

if __name__=='__main__':build()
