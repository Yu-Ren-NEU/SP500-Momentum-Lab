"""Audit the static deployment output; local-only observations cannot be uploaded."""
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser();p.add_argument('--summary',action='store_true');args=p.parse_args()
    output=ROOT/'dist'
    if not (output/'index.html').exists():raise ValueError('Build is missing')
    for file in output.rglob('*'):
        if file.name.endswith('.local.json') or any(part in ('raw','private') for part in file.relative_to(output).parts):
            raise ValueError('Local or raw research file in release: '+str(file))
    base=json.loads((output/'data/stocks-base.json').read_text())
    if base.get('redistribution')!='permitted':raise ValueError('Stock base is not marked for publication')
    index=json.loads((output/'data/public.json').read_text())
    ytd=json.loads((output/'data/stocks-ytd.json').read_text())
    if args.summary:
        print(f"Public sample stock cutoff: {ytd['asOf']}; complete annual sample: {base['startYear']}-{base['endYear']}; index annual cutoff: {index['completeThrough']}. Incomplete historical universe; local price-only research excluded.")
    else:print('Release audit passed: derived public snapshots only; no local/raw/private files.')
if __name__=='__main__':main()
