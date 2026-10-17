"""Allow-list publication schema: no raw quotes, teaching records, or licensed stocks."""
import hashlib,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def validate(data):
 expected={'schemaVersion','updatedAt','completeThrough','version','sources','updateWarnings','benchmarks','nasdaqLastObservation','research','rankingEvidence'}
 if set(data)!=expected: raise ValueError('Unexpected public dataset keys: '+str(set(data)^expected))
 if data['schemaVersion']!=1: raise ValueError('Invalid schema')
 for key,start,basis in [('sp500',1958,'total_return'),('nasdaq',1972,'price_return')]:
  rows=data['benchmarks'][key]; years=sorted(map(int,rows))
  if not years or years!=list(range(start,max(years)+1)): raise ValueError('Missing benchmark year: '+key)
  for y,row in rows.items():
   r=row['return']
   if not isinstance(r,(int,float)) or isinstance(r,bool) or not math.isfinite(r) or r< -1: raise ValueError('Invalid return '+y)
   if row['basis']!=basis or row['source']!=('nyu' if key=='sp500' else 'nasdaq'): raise ValueError('Basis mismatch')
 if set(data['research'])!={'membershipEvidenceIntervals','membershipLastEndpoint','notes'}: raise ValueError('Teaching/security records must stay private')
 for s in data['sources'].values():
  for k in ('url','retrievedAt','sha256','rights','rightsUrl'):
   if not s.get(k): raise ValueError('Source provenance missing '+k)
 content={k:data[k] for k in ('schemaVersion','benchmarks','rankingEvidence')}
 version=hashlib.sha256(json.dumps(content,sort_keys=True).encode()).hexdigest()[:16]
 if data['version']!=version: raise ValueError('Content hash mismatch')
 return True
if __name__=='__main__':
 files=list((ROOT/'public/data/versions').glob('*.json'))+[ROOT/'public/data/public.json']
 for path in files: validate(json.loads(path.read_text()))
 print(f'Validated {len(files)} public snapshots; no individual licensed stock records.')
