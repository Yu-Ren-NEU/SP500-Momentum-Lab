"""Include the reviewed Sandisk 2025 listing period in the public sample.

The same security began when-issued trading as SNDKV on February 13 and
regular-way trading as SNDK on February 24. Do not substitute today's members.
"""
import csv
import io
import json
import math
import zipfile
from build_base import RAW, PUBLIC, ROOT, digest, merge, write_manifest
from update import atomic_json
from validate_public import validate_base

EVIDENCE='https://classic.nasdaqtrader.com/TraderNews.aspx?id=ECA2025-38'

def listing_return(rows):
    rows=sorted((r for r in rows if r['symbol']=='SNDK' and r['date'][:4]=='2025'),key=lambda r:r['date'])
    if not rows or rows[0]['date'][:10]!='2025-02-13' or rows[-1]['date'][:10]!='2025-12-31':
        raise ValueError('Reviewed listing endpoints changed')
    prices=[float(r['close']) for r in rows]
    if len(prices)<200 or any(not math.isfinite(v) or v<=0 for v in prices):raise ValueError('Invalid listing observations')
    if any(abs(b/a-1)>.5 for a,b in zip(prices,prices[1:])):raise ValueError('Unreviewed listing discontinuity')
    return prices[-1]/prices[0]-1,prices[0],prices[-1]

def main():
    metadata=json.loads((RAW/'kaggle-metadata.json').read_text())
    if metadata.get('licenseName')!='CC0: Public Domain':raise ValueError('Source declaration changed')
    with zipfile.ZipFile(RAW/'kaggle-recent.zip') as z:
        with z.open('sp500_stocks.csv') as f:
            rows=[r for r in csv.DictReader(io.TextIOWrapper(f)) if r['symbol']=='SNDK']
    value,start,end=listing_return(rows)
    with (RAW/'members.csv').open() as f:members=sorted(csv.DictReader(f),key=lambda r:r['date'])
    cohort=set([r for r in members if r['date']<='2025-12-31'][-1]['tickers'].split(','))
    if 'SNDK' not in cohort:raise ValueError('Historical year-end membership missing')
    base=json.loads((PUBLIC/'stocks-base.json').read_text())
    row={'id':'fnspid:SNDK','ticker':'SNDK','name':'Sandisk','totalReturn':value,'source':'kaggle-reviewed-2025-new-listing-close-ratio'}
    for target in (base['returns']['2025'],base['rankings']['2025']['rows']):
        target[:]=[r for r in target if r['ticker']!='SNDK']+[row.copy()]
    rank=base['rankings']['2025'];rank['rows'].sort(key=lambda r:(-r['totalReturn'],r['id']));rank['count']=len(rank['rows'])
    coverage=base['coverage']['2025'];coverage['available']=rank['count'];coverage['missing']=[t for t in coverage['missing'] if t!='SNDK']
    base.setdefault('partialListingPeriods',{})['2025:SNDK']={'from':'2025-02-13','to':'2025-12-31','source':EVIDENCE,'note':'When-issued SNDKV from February 13; regular-way SNDK from February 24. Includes the when-issued period.'}
    base['limitations']=list(dict.fromkeys(base['limitations']+['SNDK 2025 uses the reviewed first when-issued close on 2025-02-13, not a fictitious 2024 endpoint. The public sample otherwise retains its disclosed adjustment uncertainty.']))
    result=merge({},base);validate_base(result)
    atomic_json(PUBLIC/'stocks-base.json',result,compact=True)
    atomic_json(PUBLIC/'base-versions'/(result['version']+'.json'),result,compact=True);write_manifest(result)
    atomic_json(ROOT/'data/research/new-listing-review.json',{'ticker':'SNDK','year':2025,'baseVersion':result['version'],'from':'2025-02-13','to':'2025-12-31','startClose':start,'endClose':end,'return':value,'listingEvidence':EVIDENCE,'priceSource':'https://www.kaggle.com/datasets/darkmatternet/s-and-p-500-stocks-25-years-of-data-updated-daily','sourceSha256':digest(RAW/'kaggle-recent.zip'),'license':'Uploader declares CC0; derived exploratory observations','note':'Includes when-issued trading; a partial listing period, not a full calendar-year holding return.'})
    print(result['version'],rank['rows'][0]['ticker'],value)

if __name__=='__main__':main()
