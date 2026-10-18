"""Build an explicit year-by-year research catalogue, separate from backtest inputs."""
import json
import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build():
    base = json.loads((ROOT / 'public/data/stocks-base.json').read_text())
    years = {}
    for year in range(1958, dt.datetime.now(dt.timezone.utc).year+1):
        rank = base['rankings'].get(str(year))
        years[str(year)] = {
            'period': 'ytd' if year == dt.datetime.now(dt.timezone.utc).year else 'calendar-year',
            'status': 'available-sample' if rank else 'missing',
            'asOf': rank['asOf'] if rank else None,
            'eligibleForVerifiedBacktest': False,
            'universe': rank['universe'] if rank else 'not-established',
            'source': rank['source'] if rank else None,
            'observedUniverseCount': rank['count'] if rank else 0,
            'rows': [dict(row, rank=i + 1) for i, row in enumerate(rank['rows'][:10])] if rank else [],
            'evidence': [],
        }
    years['2023']['evidence'].append({
        'url': 'https://www.youtube.com/watch?v=Mvg0Q4oR218',
        'publisher': 'FAST Graphs', 'published': '2024-05-03',
        'status': 'reported-top10-unordered',
        'note': 'Author reports top-ten membership. Description is alphabetical; no numeric ranking or return inferred. Redistribution permission for underlying market data not established; evidence link only.'
    })
    years['2024']['evidence'].append({
        'url': 'https://www.fool.com/investing/2025/01/20/these-were-the-5-top-performing-stocks-in-the-sp-5/',
        'status': 'conflicting-methodology',
        'note': 'Finviz-based five-stock list excludes partial-year listing GEV; differs from other year-end reports. Not merged into verified rankings. Underlying data redistribution permission not established.'
    })
    years['2025']['evidence'].append({
        'url': 'https://www.fool.com/investing/2026/01/11/these-were-the-sp-500s-top-performers-in-2025-are/',
        'status': 'research-lead',
        'note': 'Post-year-end review; still needs full ten-stock ranking, return convention and point-in-time membership verification.'
    })
    current_path = ROOT / 'data/research/current-year-sample.json'
    if current_path.exists():
        current = json.loads(current_path.read_text())
        if current['year'] == dt.datetime.now(dt.timezone.utc).year:
            years[str(current['year'])].update(current)
            years[str(current['year'])]['eligibleForVerifiedBacktest'] = False
    evidence_path = ROOT / 'data/research/reported-evidence.json'
    if evidence_path.exists():
        for observation in json.loads(evidence_path.read_text())['observations']:
            years[str(observation['year'])]['evidence'].append({k:v for k,v in observation.items() if k != 'rows'})
    target = ROOT / 'data/research/top10-history.json'
    if target.exists() and not evidence_path.exists():
        previous = json.loads(target.read_text())
        for year, record in years.items():
            for evidence in previous.get('years',{}).get(year,{}).get('evidence',[]):
                safe={k:v for k,v in evidence.items() if k!='rows'}
                if safe not in record['evidence']:record['evidence'].append(safe)
    result = {'schemaVersion': 1, 'range': [1958, dt.datetime.now(dt.timezone.utc).year],
              'purpose': 'Research catalogue; sample rankings are not full historical S&P 500 rankings.',
              'baseVersion': base['version'],
              'updatePolicy': 'Current-year YTD requires explicit source cutoff. Freeze only after final trading day and source reconciliation; corrections require a documented revision. Never overwrite history with current membership.',
              'years': years}
    target = ROOT / 'data/research/top10-history.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    from audit_integrity import build as audit
    audit()
    print('Built '+str(len(years))+' annual catalogue records; sample years:', sum(y['status'] == 'available-sample' for y in years.values()))

if __name__ == '__main__':
    build()
