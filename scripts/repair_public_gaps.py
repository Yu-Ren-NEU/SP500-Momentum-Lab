"""Repair an explicitly reviewed public holding gap from the licensed FNSPID archive.

Only QRVO 2020 is approved here. Reject dividend adjustments or discontinuities;
this exception must not turn into a generic fallback across incompatible donors.
"""
import csv
import io
import json
import math
import zipfile
from build_base import RAW, PUBLIC, ROOT, digest, merge, write_manifest
from update import atomic_json
from validate_public import validate_base


def reviewed_return(rows):
    selected = sorted((r for r in rows if '2019-12-31' <= r['date'][:10] <= '2020-12-31'), key=lambda r:r['date'])
    prices = {}
    previous = None
    for row in selected:
        price, adjusted = float(row['close']), float(row['adj close'])
        if not math.isfinite(price) or price <= 0 or not math.isclose(price, adjusted, rel_tol=1e-6):
            raise ValueError('QRVO price/adjusted-price convention changed')
        if previous and abs(price / previous - 1) > .5:
            raise ValueError('Unreviewed QRVO discontinuity')
        previous = price
        prices[row['date'][:10]] = price
    if len(prices) < 250:
        raise ValueError('Insufficient daily observations')
    return prices['2020-12-31'] / prices['2019-12-31'] - 1, prices


def main():
    archive_path = RAW/'fnspid-prices.zip'
    with zipfile.ZipFile(archive_path) as archive:
        name = 'full_history/QRVO.csv'
        rows = list(csv.DictReader(io.TextIOWrapper(archive.open(name))))
    value, prices = reviewed_return(rows)
    base = json.loads((PUBLIC/'stocks-base.json').read_text())
    key = '2020'
    if 'QRVO' not in base['coverage'][key]['missing'] and any(r['ticker']=='QRVO' for r in base['returns'][key]):
        print('QRVO 2020 is already present; preserving the frozen observation.')
        return
    row = {'id':'fnspid:QRVO','ticker':'QRVO','name':'Qorvo',
           'totalReturn':value,'source':'fnspid-reviewed-equal-close-adjusted-close'}
    base['returns'][key].append(row.copy())
    base['rankings'][key]['rows'].append(row.copy())
    base['rankings'][key]['rows'].sort(key=lambda r:(-r['totalReturn'],r['id']))
    base['rankings'][key]['count'] = len(base['rankings'][key]['rows'])
    base['coverage'][key]['missing'].remove('QRVO')
    base['coverage'][key]['available'] = base['rankings'][key]['count']
    base['limitations'] = list(dict.fromkeys(base['limitations'] + [
        'QRVO 2020 holding gap repaired from the licensed FNSPID daily archive: Close equals Adj Close throughout the reviewed interval, exact calendar endpoints, no daily moves above 50%. Other adjustment conventions remain unverified.'
    ]))
    result = merge({}, base)
    validate_base(result)
    atomic_json(PUBLIC/'stocks-base.json',result,compact=True)
    atomic_json(PUBLIC/'base-versions'/(result['version']+'.json'),result,compact=True)
    write_manifest(result)
    atomic_json(ROOT/'data/research/public-gap-repairs.json', {
        'baseVersion':result['version'], 'repairs':[{
            'ticker':'QRVO','year':2020,'return':value,
            'from':'2019-12-31','to':'2020-12-31',
            'startClose':prices['2019-12-31'],'endClose':prices['2020-12-31'],
            'sourceUrl':'https://github.com/Zdong104/FNSPID_Financial_News_Dataset',
            'sourceSha256':digest(archive_path),'archiveMember':name,
            'license':'CC BY-NC 4.0; noncommercial research use',
            'checks':['Exact year-end endpoints','At least 250 daily observations','Close equals Adj Close','No daily discontinuities above 50%'],
            'limitation':'A repaired holding gap does not certify the historical ranking universe.'
        }]})
    print(json.dumps({'version':result['version'],'QRVO2020':value}))

if __name__ == '__main__': main()
