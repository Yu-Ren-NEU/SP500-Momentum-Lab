import copy,importlib.util,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from build_base import merge
class BaseMergeTests(unittest.TestCase):
    def fixture(self):
        row={'id':'fixture','ticker':'TEST','name':'Synthetic only','source':'test','totalReturn':.1}
        rank={'universe':'historical-members-available-sample','count':1,'rows':[row]}
        return {'quality':'exploratory','rankings':{'2000':rank},'returns':{'2001':[row]},'coverage':{'2000':{'available':1,'members':500,'missing':[]}},'sources':[]}
    def test_sparse_patch_preserves_unmentioned_history(self):
        a=self.fixture();b=copy.deepcopy(a);b['rankings']={'2002':b['rankings'].pop('2000')};b['returns']={'2003':b['returns'].pop('2001')};b['coverage']={'2002':b['coverage'].pop('2000')};d=merge(a,b);self.assertEqual(set(d['rankings']),{'2000','2002'});self.assertEqual(d['returns']['2001'],a['returns']['2001'])
    def test_valid_patch_replaces_same_year(self):
        a=self.fixture();b=copy.deepcopy(a);b['rankings']['2000']['rows'][0]['totalReturn']=.2;d=merge(a,b);self.assertEqual(d['rankings']['2000']['rows'][0]['totalReturn'],.2);self.assertEqual(a['rankings']['2000']['rows'][0]['totalReturn'],.1)
    def test_empty_or_mismatched_patch_is_rejected(self):
        a=self.fixture();b=copy.deepcopy(a);b['rankings']['2000']['rows']=[]
        with self.assertRaises(ValueError):merge(a,b)
    def test_quality_tiers_must_never_be_blended(self):
        a=self.fixture();b=copy.deepcopy(a);b['quality']='reviewed'
        with self.assertRaises(ValueError):merge(a,b)
class PublishedBaseTests(unittest.TestCase):
    def test_published_snapshot_valid_and_known_splices_excluded(self):
        import json
        from validate_public import validate_base
        d=json.loads((ROOT/'public/data/stocks-base.json').read_text());self.assertTrue(validate_base(d))
        self.assertIn('2020',d['quarantined']['GE']);self.assertNotIn('fnspid:GE',{r['id']for r in d['rankings']['2020']['rows']})
        self.assertNotIn('fnspid:TSLA',{r['id']for r in d['returns']['2020']})
        self.assertEqual(d['rankings']['2016']['rows'][0]['ticker'],'NVDA')
    def test_raw_or_private_records_are_blocked(self):
        import json
        from validate_public import validate_base
        d=json.loads((ROOT/'public/data/stocks-base.json').read_text());d['redistribution']='local-only'
        with self.assertRaises(ValueError):validate_base(d)
        d['redistribution']='permitted';d['returns']['2020'][0]['close']=100
        with self.assertRaises(ValueError):validate_base(d)
class AtomicSnapshotTests(unittest.TestCase):
    def test_failed_serialization_preserves_last_good_financial_snapshot(self):
        import json,tempfile
        from update import atomic_json
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'base.json'
            atomic_json(path,{'return':.1},compact=True)
            with self.assertRaises(ValueError):atomic_json(path,{'return':float('nan')},compact=True)
            self.assertEqual(json.loads(path.read_text()),{'return':.1})
class YtdSnapshotTests(unittest.TestCase):
    def test_published_ytd_is_separate_and_rejects_raw_or_future_data(self):
        import json
        from validate_public import validate_ytd
        d=json.loads((ROOT/'public/data/stocks-ytd.json').read_text())
        self.assertTrue(validate_ytd(d))
        annual=json.loads((ROOT/'public/data/stocks-base.json').read_text())
        self.assertNotIn(str(d['year']),annual['returns'])
        bad=copy.deepcopy(d);bad['returns'][0]['close']=123
        with self.assertRaises(ValueError):validate_ytd(bad)
        bad=copy.deepcopy(d);bad['asOf']='2999-01-01'
        with self.assertRaises(ValueError):validate_ytd(bad)
    def test_reviewed_thc_move_restores_2010_but_other_flags_remain(self):
        import json
        d=json.loads((ROOT/'public/data/stocks-base.json').read_text())
        row=next(r for r in d['returns']['2010'] if r['id']=='fnspid:THC')
        self.assertAlmostEqual(row['totalReturn'],26.76000022888184/21.559999465942383-1)
        self.assertNotIn('2010',d['quarantined'].get('THC',{}))
        self.assertIn('2020',d['quarantined']['GE'])
if __name__=='__main__':unittest.main()
