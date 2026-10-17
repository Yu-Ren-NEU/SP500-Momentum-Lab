import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py'); mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
u=load('update');v=load('validate_public')
class DataTests(unittest.TestCase):
 def test_nyu_parser(self):
  b=b'<table><tr><td>1958</td><td>43.72%</td><td>ignored</td></tr><tr><td>1959</td><td>11.96%</td></tr></table>'
  self.assertAlmostEqual(u.parse_nyu(b,2025)['1958']['return'],.4372)
 def test_nyu_missing_year(self):
  with self.assertRaises(ValueError):u.parse_nyu(b'<tr><td>1958</td><td>10%</td></tr><tr><td>1960</td><td>20%</td></tr>',2025)
 def test_nasdaq_annual_closes(self):
  b=b'observation_date,NASDAQCOM\n1971-02-05,100\n1971-12-31,110\n1972-12-29,121\n1972-12-31,\n1973-12-31,60.5\n2026-01-01,1000\n'
  r,d=u.parse_nasdaq(b,2025);self.assertNotIn('1971',r);self.assertNotIn('2026',r);self.assertAlmostEqual(r['1972']['return'],.1);self.assertAlmostEqual(r['1973']['return'],-.5)
 def test_public_snapshot_and_reference_calculation(self):
  data=json.loads((ROOT/'public/data/public.json').read_text());self.assertTrue(v.validate(data));value=10000
  for year,r in data['benchmarks']['sp500'].items():
   if int(year)<=2025:value*=1+r['return']
  self.assertGreater(value,1e7);self.assertLess(value,1.3e7)
  self.assertEqual(len(data['benchmarks']['sp500']),data['completeThrough']-1958+1);self.assertGreaterEqual(len(data['benchmarks']['nasdaq']),54)
 def test_restricted_records_cannot_publish(self):
  data=json.loads((ROOT/'public/data/public.json').read_text());data['membershipEvidence']=[{'permno':'private'}]
  with self.assertRaises(ValueError):v.validate(data)
 def test_invalid_price_return_rejected(self):
  data=json.loads((ROOT/'public/data/public.json').read_text());data['benchmarks']['nasdaq']['1972']['return']=float('nan')
  with self.assertRaises(ValueError):v.validate(data)
if __name__=='__main__':unittest.main()
