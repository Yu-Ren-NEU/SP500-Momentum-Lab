"""Reviewed fallback refuses incomplete or incompatible price histories."""
import datetime as dt
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from repair_public_gaps import reviewed_return

class PublicGapRepairTests(unittest.TestCase):
    def rows(self):
        first=dt.date(2019,12,31)
        return [{'date':(first+dt.timedelta(days=i)).isoformat(),
                 'close':str(100+i/10),'adj close':str(100+i/10)} for i in range(367)]

    def test_exact_endpoints_and_convention(self):
        rows=self.rows()
        value,_=reviewed_return(rows)
        self.assertAlmostEqual(value,.366)
        rows[50]['adj close']='90'
        with self.assertRaisesRegex(ValueError,'convention'): reviewed_return(rows)

    def test_missing_endpoint_or_discontinuity_rejected(self):
        rows=self.rows()
        with self.assertRaises(KeyError): reviewed_return(rows[:-1])
        rows[80]['close']=rows[80]['adj close']='500'
        with self.assertRaisesRegex(ValueError,'discontinuity'): reviewed_return(rows)
