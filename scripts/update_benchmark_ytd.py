"""Build local-only YTD index returns; retain raw quotes outside publication paths."""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
URLS = {
    'sp500': 'https://query1.finance.yahoo.com/v8/finance/chart/%5ESP500TR?range=2y&interval=1d',
    'nasdaq': 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQCOM',
}

def parse_sp(raw):
    data = json.loads(raw)['chart']['result'][0]
    if data['meta']['symbol'] != '^SP500TR':
        raise ValueError('Expected the total-return index')
    return {dt.datetime.fromtimestamp(t, dt.timezone.utc).date().isoformat(): v
            for t, v in zip(data['timestamp'], data['indicators']['quote'][0]['close'])
            if v is not None}

def parse_nasdaq(raw):
    return {r.get('observation_date', r.get('DATE')): float(r['NASDAQCOM'])
            for r in csv.DictReader(raw.decode().splitlines())
            if r['NASDAQCOM'] not in ('', '.')}

def build(sp, nasdaq, cutoff):
    year = int(cutoff[:4])
    common = sorted(d for d in sp.keys() & nasdaq.keys() if d.startswith(str(year)) and d <= cutoff)
    if not common:
        raise ValueError('No common current-year trading date')
    as_of = common[-1]
    if as_of != cutoff:
        raise ValueError('Indices must match the stock cutoff; retain previous snapshot')
    rows = {}
    for key, prices in [('sp500', sp), ('nasdaq', nasdaq)]:
        dates = sorted(d for d in prices if d.startswith(f'{year-1}-12-'))
        if not dates or dates[-1] < f'{year-1}-12-28':
            raise ValueError('Prior year-end endpoint missing')
        start = dates[-1]
        a, b = prices[start], prices[as_of]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in (a,b)):
            raise ValueError('Invalid index endpoint')
        rows[key] = {'return': b/a-1, 'from':start, 'to':as_of,
                     'basis':'total_return' if key == 'sp500' else 'price_return'}
    return {'schemaVersion':1, 'kind':'benchmarks-ytd', 'year':year, 'asOf':as_of,
            'redistribution':'local-only-pending-rights-review', 'benchmarks':rows}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    RAW.mkdir(exist_ok=True, parents=True)
    paths = {'sp500': RAW/'sp500tr-ytd.json', 'nasdaq':RAW/'nasdaq.csv'}
    if args.download:
        for key, url in URLS.items():
            request = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
            raw = urllib.request.urlopen(request, timeout=30).read()
            (parse_sp if key == 'sp500' else parse_nasdaq)(raw)
            paths[key].write_bytes(raw)
    raw = {key:path.read_bytes() for key,path in paths.items()}
    cutoff = json.loads((ROOT/'public/data/stocks-ytd.json').read_text())['asOf']
    data = build(parse_sp(raw['sp500']), parse_nasdaq(raw['nasdaq']), cutoff)
    data['sources'] = {key:{'url':URLS[key], 'sha256':hashlib.sha256(value).hexdigest(),
        'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
        'rights':'Local research only; public redistribution not established'} for key,value in raw.items()}
    data['version'] = hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()[:16]
    target = ROOT/'public/data/benchmarks-ytd.local.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(data,indent=2)+'\n')
    temporary.replace(target)
    print(f"Local benchmark YTD updated through {data['asOf']}; excluded from Git and production builds.")

if __name__ == '__main__':
    main()
