"""Restore source observations only after a narrowly scoped event review."""
import csv
import io
import json
import zipfile
from build_base import RAW, PUBLIC, merge, write_manifest
from update import atomic_json
from validate_public import validate_base

EVIDENCE = 'https://www.sec.gov/Archives/edgar/data/70318/000119312510277954/dex991.htm'

def main():
    base = json.loads((PUBLIC/'stocks-base.json').read_text())
    with zipfile.ZipFile(RAW/'fnspid-prices.zip') as archive:
        name = next(n for n in archive.namelist() if n.endswith('/THC.csv') and not n.startswith('__MACOSX'))
        rows = list(csv.DictReader(io.TextIOWrapper(archive.open(name))))
    prices = {r['date'][:10]:float(r['adj close']) for r in rows}
    jump = prices['2010-12-10']/prices['2010-12-09']-1
    if not .54 < jump < .56:
        raise ValueError('Reviewed event observation changed; review again')
    flags = base.get('quarantined',{}).get('THC',{}).get('2010',[])
    if any(not flag.startswith('2010-12-10:') for flag in flags):
        raise ValueError('Additional THC discontinuities require separate review')
    row = {'id':'fnspid:THC','ticker':'THC','name':'THC',
           'totalReturn':prices['2010-12-31']/prices['2009-12-31']-1,'source':'fnspid-adjusted-close'}
    key = '2010'
    for section in ('rankings','returns'):
        target = base[section][key]['rows'] if section == 'rankings' else base[section][key]
        target[:] = [r for r in target if r['id'] != row['id']] + [row.copy()]
        if section == 'rankings': target.sort(key=lambda r:(-r['totalReturn'],r['id']))
    base['rankings'][key]['count'] = len(base['rankings'][key]['rows'])
    cov = base['coverage'][key]
    cov['missing'] = [t for t in cov['missing'] if t != 'THC']
    cov['available'] = base['rankings'][key]['count']
    base.get('quarantined',{}).get('THC',{}).pop(key,None)
    base['limitations'] = list(dict.fromkeys(base['limitations'] + ['THC 2010-12-10 event exception: takeover proposal confirmed in SEC exhibit; observed 55% move retained. '+EVIDENCE]))
    result = merge({},base)
    validate_base(result)
    snapshot = PUBLIC/'base-versions'/(result['version']+'.json')
    if not snapshot.exists(): atomic_json(snapshot,result,compact=True)
    atomic_json(PUBLIC/'stocks-base.json',result,compact=True)
    write_manifest(result)
    print(result['version'])

if __name__ == '__main__': main()
