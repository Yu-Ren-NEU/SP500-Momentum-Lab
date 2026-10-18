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
