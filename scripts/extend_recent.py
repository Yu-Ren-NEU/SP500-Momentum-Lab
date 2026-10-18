"""Extend exploratory years using CC0 Kaggle close ratios and historic membership.
Close adjustment is undocumented; these are NOT certified total returns.
"""
import csv
import hashlib
import datetime as dt
import io
import json
import math
import zipfile
from build_base import ROOT, RAW, PUBLIC, ALIASES, digest, merge, write_manifest
from update import atomic_json
from validate_public import validate_base

URL = 'https://www.kaggle.com/datasets/darkmatternet/s-and-p-500-stocks-25-years-of-data-updated-daily'

def build(freeze_history=False):
    base = json.loads((PUBLIC/"stocks-base.json").read_text())
    current_year = dt.datetime.now(dt.timezone.utc).year
    meta = json.loads((RAW/'kaggle-metadata.json').read_text())
    if meta.get('licenseName') != 'CC0: Public Domain':
        raise ValueError('Dataset license changed; review before publishing')
    ends = {}
    with (ROOT/'data/raw/nasdaq.csv').open() as f:
        for row in csv.DictReader(f):
            date = row.get('observation_date') or row.get('DATE')
            if date and date[5:7] == '12' and row.get('NASDAQCOM') not in (None, '.', ''):
                ends[int(date[:4])] = date
    with (RAW/'members.csv').open() as f:
        members = sorted(csv.DictReader(f), key=lambda r:r['date'])
    close, previous, invalid, names = {}, {}, {}, {}
    with zipfile.ZipFile(RAW/'kaggle-recent.zip') as z:
        with z.open('sp500_companies.csv') as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw)):
                names[row['symbol']] = row['company']
        with z.open('sp500_stocks.csv') as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw)):
                date, symbol = row['date'][:10], row['symbol']
                if date < '2022-01-01': continue
                try: value = float(row['close'])
                except (ValueError, TypeError): continue
                if not math.isfinite(value) or value <= 0: continue
                prev = previous.get(symbol)
                if prev:
                    if date <= prev[0]: raise ValueError('Source observations not strictly ordered per symbol')
                    if abs(value / prev[1] - 1) > .5:
                        invalid.setdefault(symbol, set()).add(int(date[:4]))
                previous[symbol] = (date, value)
                year = int(date[:4])
                if date == ends.get(year): close.setdefault(symbol, {})[year] = value
    # Keep partial 2026 in the research catalogue, never the full-year engine.
    latest = max(date for date, _ in previous.values())
    observation_year = int(latest[:4])
    if observation_year != current_year and not (observation_year == current_year-1 and dt.datetime.now(dt.timezone.utc).month == 1):
        raise ValueError('Source cutoff is stale; preserve the previous snapshot')
    if latest > dt.datetime.now(dt.timezone.utc).date().isoformat():
        raise ValueError('Source cutoff is in the future')
    ytd_rows = []
    cohort_ytd = set(members[-1]['tickers'].split(','))
    for symbol, (date, value) in previous.items():
        if date != latest or symbol not in cohort_ytd or observation_year-1 not in close.get(symbol, {}) or observation_year in invalid.get(symbol, set()): continue
        ytd_rows.append({'ticker':symbol,'name':names.get(symbol,symbol),'return':value/close[symbol][observation_year-1]-1})
    ytd_rows.sort(key=lambda r:(-r['return'],r['ticker']))
    ytd = {'year':observation_year,'period':'ytd','asOf':latest,'status':'available-sample',
           'sourceUrl':URL,'sourceSha256':digest(RAW/'kaggle-recent.zip'),
           'basis':'close-ratio-adjustment-unverified','observedUniverseCount':len(ytd_rows),
           'rows':[dict(row,rank=i+1) for i,row in enumerate(ytd_rows[:10])],
           'note':'Partial year; membership snapshot through '+members[-1]['date']+'; not a full-universe or total-return ranking.'}
    atomic_json(ROOT/'data/research/current-year-sample.json',ytd)
    holding_returns = []
    for symbol, (date, value) in previous.items():
        if date != latest or observation_year-1 not in close.get(symbol,{}) or observation_year in invalid.get(symbol,set()): continue
        holding_returns.append({'id':'fnspid:'+ALIASES.get(symbol,symbol.replace('.','-')),'ticker':symbol,
                                'name':names.get(symbol,symbol),'totalReturn':value/close[symbol][observation_year-1]-1,
                                'source':'kaggle-close-ratio-adjustment-unverified'})
    current = {'schemaVersion':1,'kind':'stocks-ytd','year':observation_year,'asOf':latest,
               'sourceUrl':URL,'sourceSha256':ytd['sourceSha256'],'license':'Uploader declares CC0: Public Domain',
               'basis':'close-ratio-adjustment-unverified','returns':holding_returns}
    current['version'] = hashlib.sha256(json.dumps(current,sort_keys=True).encode()).hexdigest()[:16]
    atomic_json(PUBLIC/'stocks-ytd.json',current,compact=True)
    atomic_json(PUBLIC/'ytd-versions'/(current['version']+'.json'),current,compact=True)

    rankings, returns, coverage = {}, {}, {}
    for year in range(max(2023, base["endYear"]+1) if freeze_history else 2023, current_year):
        cohort = set([r for r in members if r['date'] <= f'{year}-12-31'][-1]['tickers'].split(','))
        annual = {}
        for symbol, prices in close.items():
            if year not in prices or year-1 not in prices or year in invalid.get(symbol,set()): continue
            identity = ALIASES.get(symbol, symbol.replace('.', '-'))
            annual[symbol] = {'id':'fnspid:'+identity, 'ticker':symbol, 'name':names.get(symbol,symbol),
                              'totalReturn':prices[year]/prices[year-1]-1,
                              'source':'kaggle-close-ratio-adjustment-unverified'}
        rows = [annual[t] for t in sorted(cohort) if t in annual]
        rows.sort(key=lambda r:(-r['totalReturn'], r['id']))
        if len(rows) < 10: raise ValueError(f'No complete endpoints for {year}')
        key = str(year)
        coverage[key] = {'members':len(cohort),'available':len(rows),'missing':sorted(cohort-set(annual))}
        rankings[key] = {'status':'provisional','asOf':key+'-12-31','universe':'historical-members-available-sample',
                         'source':'Kaggle CC0 close ratios intersected with fja05680 year-end members; adjustment unverified', 'count':len(rows),'rows':rows}
        returns[key] = list(annual.values())
    # Original FNSPID flags apply to that source only. New source has separate filtering above.
    quarantined = {t:{y:v for y,v in ys.items() if y not in rankings} for t,ys in base.get('quarantined',{}).items()}
    source = {'name':'Darkmatternet S&P 500 daily data, Kaggle version '+str(meta['currentVersionNumber']),
              'url':URL,'license':'Uploader declares CC0: Public Domain. Close adjustment undocumented; exploratory only.',
              'licenseUrl':URL,'sha256':digest(RAW/'kaggle-recent.zip')}
    sources = [s for s in base['sources'] if s['url'] != URL] + [source]
    patch = {'quality':'exploratory','rankings':rankings,'returns':returns,'coverage':coverage,'sources':sources,
             'quarantined':quarantined,'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
             'licenseEvidence':base['licenseEvidence']+' Recent extension: Kaggle uploader CC0 declaration; see sources.',
             'limitations':list(dict.fromkeys(base['limitations']+[
                 '2023-2025 use Kaggle close ratios with undocumented adjustment, not verified dividend-inclusive total returns.',
                 'Recent price availability is drawn from surviving/current members, intersected with each historical year-end member list. Missing former members cause selection bias.',
                 'Kaggle incremental refresh may splice adjustment conventions; adjacent moves over 50% exclude a security-year. Smaller source errors may remain.'
             ]))}
    result = merge(base,patch)
    validate_base(result)
    snapshot = PUBLIC/'base-versions'/(result['version']+'.json')
    if not snapshot.exists(): atomic_json(snapshot,result,compact=True)
    atomic_json(PUBLIC/'stocks-base.json',result,compact=True)
    write_manifest(result)
    print(json.dumps({'version':result['version'],'years':{y:len(r['rows']) for y,r in rankings.items()},'top1':{y:r['rows'][0]['ticker'] for y,r in rankings.items()}}))

if __name__ == '__main__': build()
