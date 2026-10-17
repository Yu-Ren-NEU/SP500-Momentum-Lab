"""Validate externally authorized annual stock exports; default output is private.
No vendor credentials are read; no missing returns are inferred or imputed.
"""
import argparse,csv,datetime as dt,json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).parent))
from update import atomic_json

def build(annual,membership,audit):
 if not audit.get('reviewer') or not audit.get('licenseEvidence'):raise ValueError('Reviewer and licenseEvidence are required')
 if not annual or not membership:raise ValueError('Annual returns and membership must be nonempty')
 returns={}; annual_by={}
 for row in annual:
  y=int(row['year']);identity=row['id'];r=float(row['total_return']);key=(y,identity)
  if not identity or key in annual_by or not math.isfinite(r) or r< -1:raise ValueError('Duplicate/invalid annual security record: '+str(key))
  if row['coverage_start']!=f'{y-1}-12-31' or row['coverage_end']!=f'{y}-12-31':raise ValueError('Requires complete calendar-year wealth including terminal cash: '+str(key))
  if any(row.get(k)!='true' for k in ('corporate_actions_reviewed','delisting_reviewed')):raise ValueError('Corporate actions/delisting review required: '+str(key))
  if not all(row.get(k) for k in ('source','ticker','name')):raise ValueError('Missing security provenance')
  item={'id':identity,'ticker':row['ticker'],'name':row['name'],'totalReturn':r,'source':row['source']}
  annual_by[key]=item;returns.setdefault(str(y),[]).append(item)
 for row in membership:
  for k in ('start','end'):dt.date.fromisoformat(row[k])
  if not row['id'] or not row['source'] or row['start']>row['end']:raise ValueError('Invalid membership interval')
 rankings={}
 for year,review in audit.get('years',{}).items():
  y=int(year);date=f'{y}-12-31'
  if not review.get('source') or review.get('completePointInTimeUniverse') is not True:raise ValueError('Complete universe attestation is required: '+year)
  cohort={r['id'] for r in membership if r['start']<=date<=r['end']}
  if len(cohort)!=review['expectedMembers']:raise ValueError('Membership count differs from independently reviewed source: '+year)
  # IPOs lacking a full calendar-year total return must be explicitly reviewed/excluded.
  excluded=set(review.get('excludedIncompleteYearIds',[]))
  if not excluded.issubset(cohort):raise ValueError('Excluded ID is not a historical member')
  eligible=cohort-excluded
  if len(eligible)<10:raise ValueError('Insufficient eligible universe')
  missing=[i for i in sorted(eligible) if (y,i) not in annual_by]
  if missing:raise ValueError('Missing historical member returns (never silently dropped): '+str(missing))
  rows=sorted([annual_by[(y,i)] for i in eligible],key=lambda r:(-r['totalReturn'],r['id']))
  rankings[year]={'status':'reviewed','asOf':date,'universe':'year-end-sp500-full-year-total-return','source':review['source'],'count':len(rows),'excludedIncompleteYearIds':sorted(excluded),'rows':rows}
 if not rankings:raise ValueError('No independently reviewed ranking years')
 return {'schemaVersion':1,'redistribution':'local-only','licenseEvidence':audit['licenseEvidence'],'rankings':rankings,'returns':returns}

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--annual',type=Path,required=True);p.add_argument('--membership',type=Path,required=True);p.add_argument('--audit',type=Path,required=True)
 p.add_argument('--output',type=Path,default=ROOT/'data/private/stocks.json');args=p.parse_args()
 output=args.output.resolve()
 if ROOT/'public' in output.parents or ROOT/'dist' in output.parents:raise ValueError('Private vendor data cannot be written under public/ or dist/')
 with args.annual.open() as f:annual=list(csv.DictReader(f))
 with args.membership.open() as f:membership=list(csv.DictReader(f))
 data=build(annual,membership,json.loads(args.audit.read_text()))
 atomic_json(output,data);print(f'Validated {len(data["rankings"])} ranking years. Saved local-only data to {output}')
if __name__=='__main__':main()
