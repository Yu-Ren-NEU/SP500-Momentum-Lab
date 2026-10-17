import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepare_stocks',Path(__file__).resolve().parents[1]/'scripts/prepare_stocks.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class ImportTests(unittest.TestCase):
 def fixture(self):
  annual=[{'year':'2000','id':str(i),'ticker':'SYNTH','name':'Synthetic fixture','total_return':str(i*.1),'coverage_start':'1999-12-31','coverage_end':'2000-12-31','source':'test-only','corporate_actions_reviewed':'true','delisting_reviewed':'true'}for i in range(10)]
  member=[{'id':str(i),'start':'1990-01-01','end':'2000-12-31','source':'test-only'} for i in range(10)]
  audit={'reviewer':'test-only','licenseEvidence':'synthetic','years':{'2000':{'source':'test-only','completePointInTimeUniverse':True,'expectedMembers':10}}}
  return annual,member,audit
 def test_complete_pipeline(self):
  a,m,v=self.fixture();d=mod.build(a,m,v);self.assertEqual(d['rankings']['2000']['rows'][0]['id'],'9');self.assertEqual(d['redistribution'],'local-only')
 def test_missing_delisted_member_cannot_disappear(self):
  a,m,v=self.fixture()
  with self.assertRaises(ValueError):mod.build(a[:-1],m,v)
 def test_missing_review_and_incomplete_year_rejected(self):
  for key,value in [('delisting_reviewed','false'),('corporate_actions_reviewed','false'),('coverage_end','2000-11-30')]:
   a,m,v=self.fixture();a[0][key]=value
   with self.assertRaises(ValueError):mod.build(a,m,v)
 def test_count_mismatch(self):
  a,m,v=self.fixture();v['years']['2000']['expectedMembers']=500
  with self.assertRaises(ValueError):mod.build(a,m,v)
if __name__=='__main__':unittest.main()
