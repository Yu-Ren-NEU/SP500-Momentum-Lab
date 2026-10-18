"""Refresh redistributable research observations in isolation, then publish validated outputs.
Local price-only donors and private observations never enter this pipeline.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATASET='darkmatternet/s-and-p-500-stocks-25-years-of-data-updated-daily'
MEMBERS='https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes%20(Updated).csv'

def download(url,target):
    request=urllib.request.Request(url,headers={'User-Agent':'Momentum-Lab non-commercial data refresh'})
    with urllib.request.urlopen(request,timeout=90) as response, target.open('wb') as output:
        shutil.copyfileobj(response,output)

def run(staging,*args):
    subprocess.run([sys.executable,*args],cwd=staging,check=True)

def check_history(old,new):
    for year,rank in old['rankings'].items():
        if new['rankings'].get(year)!=rank or new['returns'].get(year)!=old['returns'].get(year):
            raise ValueError('Frozen historical year changed: '+year)

def check_cutoff(previous,current,today):
    cutoff=dt.date.fromisoformat(current['asOf'])
    if current['asOf']<previous['asOf']:raise ValueError('YTD cutoff regressed')
    if cutoff>today or (today-cutoff).days>10:raise ValueError('YTD cutoff is future-dated or stale')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--offline',action='store_true')
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='momentum-refresh-') as directory:
        staging=Path(directory)
        for folder in ('scripts','public/data','data/research','docs'):
            shutil.copytree(ROOT/folder,staging/folder)
        for local in (staging/'public/data').glob('*.local.json'):local.unlink()
        # Unlicensed reported observations are not refresh inputs.
        evidence=staging/'data/research/reported-evidence.json'
        if evidence.exists():evidence.unlink()
        raw=staging/'data/raw/base';raw.mkdir(parents=True)
        if args.offline:
            for name in ('kaggle-metadata.json','kaggle-recent.zip','members.csv'):
                shutil.copy2(ROOT/'data/raw/base'/name,raw/name)
            for name in ('nyu.html','nasdaq.csv'):
                shutil.copy2(ROOT/'data/raw'/name,staging/'data/raw'/name)
        else:
            download('https://www.kaggle.com/api/v1/datasets/view/'+DATASET,raw/'kaggle-metadata.json')
            metadata=json.loads((raw/'kaggle-metadata.json').read_text())
            if metadata.get('licenseName')!='CC0: Public Domain':
                raise ValueError('Dataset license changed; no data will be replaced')
            version=int(metadata['currentVersionNumber'])
            download('https://www.kaggle.com/api/v1/datasets/download/'+DATASET+'?datasetVersionNumber='+str(version),raw/'kaggle-recent.zip')
            download(MEMBERS,raw/'members.csv')
        metadata=json.loads((raw/'kaggle-metadata.json').read_text())
        if metadata.get('licenseName')!='CC0: Public Domain':raise ValueError('CC0 declaration missing')
        with zipfile.ZipFile(raw/'kaggle-recent.zip') as archive:
            if not {'sp500_stocks.csv','sp500_companies.csv'}.issubset(archive.namelist()):raise ValueError('Source schema changed')
        run(staging,'scripts/update.py',*(['--offline'] if args.offline else []))
        run(staging,'-c','import sys;sys.path.insert(0,"scripts");from extend_recent import build;build(freeze_history=True)')
        run(staging,'scripts/build_top10_history.py')
        run(staging,'scripts/validate_public.py')
        old=json.loads((ROOT/'public/data/stocks-base.json').read_text())
        new=json.loads((staging/'public/data/stocks-base.json').read_text())
        # Once a completed year is published, scheduled refreshes cannot revise it.
        check_history(old,new)
        previous=json.loads((ROOT/'public/data/stocks-ytd.json').read_text())
        current=json.loads((staging/'public/data/stocks-ytd.json').read_text())
        check_cutoff(previous,current,dt.datetime.now(dt.timezone.utc).date())
        targets=['public/data','data/research/top10-history.json','data/research/current-year-sample.json','docs/HOLDING-GAPS.csv']
        changed=[]
        for name in targets:
            source=staging/name
            files=source.rglob('*') if source.is_dir() else [source]
            for file in files:
                if not file.is_file():continue
                relative=file.relative_to(staging)
                if file.name.endswith('.local.json'):raise ValueError('Local research data cannot be published')
                dest=ROOT/relative
                payload=file.read_bytes()
                if not dest.exists() or dest.read_bytes()!=payload:
                    dest.parent.mkdir(parents=True,exist_ok=True)
                    temporary=dest.with_suffix(dest.suffix+'.refresh-tmp');temporary.write_bytes(payload);os.replace(temporary,dest)
                    changed.append(str(relative))
        print(json.dumps({'updatedFiles':changed,'asOf':current['asOf'],'year':current['year'],'frozenHistoricalYears':len(old['rankings'])}))
if __name__=='__main__':main()
