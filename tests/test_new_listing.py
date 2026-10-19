"""A new listing needs exact reviewed dates, not a made-up prior-year close."""
import datetime as dt
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from repair_new_listing import listing_return

class ListingTests(unittest.TestCase):
    def test_partial_period_and_missing_first_close(self):
        start=dt.date(2025,2,13)
        rows=[{'symbol':'SNDK','date':(start+dt.timedelta(days=i)).isoformat(),'close':str(100+i)} for i in range(322)]
        value,first,last=listing_return(rows)
        self.assertAlmostEqual(value,3.21)
        self.assertEqual((first,last),(100,421))
        with self.assertRaisesRegex(ValueError,'endpoints'):listing_return(rows[1:])
        rows[80]['close']='10000'
        with self.assertRaisesRegex(ValueError,'discontinuity'):listing_return(rows)

    def test_published_winner_has_listing_evidence(self):
        import json
        root=Path(__file__).resolve().parents[1]
        base=json.loads((root/'public/data/stocks-base.json').read_text())
        self.assertEqual(base['rankings']['2025']['rows'][0]['ticker'],'SNDK')
        self.assertAlmostEqual(base['rankings']['2025']['rows'][0]['totalReturn'],237.3800048828125/36-1)
        self.assertEqual(base['partialListingPeriods']['2025:SNDK']['from'],'2025-02-13')
