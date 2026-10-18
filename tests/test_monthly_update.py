"""Refresh guards use synthetic snapshots; network access is not needed."""
import datetime as dt
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from monthly_update import check_history,check_cutoff
class MonthlyTests(unittest.TestCase):
    def test_completed_history_is_immutable(self):
        old={'rankings':{'2024':{'rows':['synthetic']}},'returns':{'2024':[.1]}}
        check_history(old,{**old,'rankings':{**old['rankings'],'2025':{'rows':[]}}})
        with self.assertRaises(ValueError):check_history(old,{**old,'returns':{'2024':[.2]}})
        with self.assertRaises(ValueError):check_history(old,{**old,'rankings':{}})
    def test_cutoff_cannot_regress_or_be_stale_or_future(self):
        prior={'asOf':'2026-10-15'}
        check_cutoff(prior,{'asOf':'2026-10-16'},dt.date(2026,10,18))
        for date in ['2026-10-14','2026-10-19','2026-10-01']:
            with self.assertRaises(ValueError):check_cutoff(prior,{'asOf':date},dt.date(2026,10,18))
