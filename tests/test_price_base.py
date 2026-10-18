"""Price-only math fixtures never use dividend-adjusted prices."""
import importlib.util
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_price_base import observations, annual_return, period_start

class PriceBaseTests(unittest.TestCase):
    def test_close_not_adjusted_close(self):
        data={'chart':{'result':[{'meta':{},'timestamp':[1609372800,1640908800],
            'indicators':{'quote':[{'close':[100,120]}],'adjclose':[{'adjclose':[50,90]}]}}]}}
        _,rows=observations(data)
        self.assertAlmostEqual(annual_return(rows[0][1],rows[1][1]),.2)
        with self.assertRaises(ValueError):annual_return(0,120)
        with self.assertRaises(ValueError):annual_return(100,float('nan'))

    def test_new_listing_uses_first_close_and_missing_history_is_not_assumed_to_be_an_ipo(self):
        self.assertEqual(period_start({2025:200},2025,'price','price',('2025-02-13',40)),(40,'2025-02-13'))
        self.assertEqual(period_start({2024:100,2025:200},2025,'price','price',None),(100,None))
        self.assertEqual(period_start({2024:100,2025:200},2025,'price','dividend-adjusted',None),(None,None))
        self.assertEqual(period_start({2025:200},2025,'price',None,('2024-02-13',40)),(None,None))

    def test_reviewed_issuer_endpoints_require_exact_dates_and_provenance(self):
        from build_price_base import reviewed_row
        review={'id':'synthetic:issuer','ticker':'SYNTH','year':2023,'basis':'split_adjusted_price_return',
                'from':'2022-12-30','to':'2023-12-29','startClose':100,'endClose':110,
                'sources':['https://example.org/issuer/2022','https://example.org/issuer/2023'],
                'evidence':'Synthetic endpoint verification fixture'}
        ends={2022:'2022-12-30',2023:'2023-12-29'}
        self.assertAlmostEqual(reviewed_row(review,ends)['totalReturn'],.1)
        with self.assertRaises(ValueError):reviewed_row({**review,'to':'2023-12-28'},ends)
        with self.assertRaises(ValueError):reviewed_row({**review,'sources':[]},ends)
        with self.assertRaises(ValueError):reviewed_row({**review,'basis':'total_return'},ends)
