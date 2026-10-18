"""Synthetic endpoint tests; no licensed observations in fixtures."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('benchmark_ytd',Path(__file__).resolve().parents[1]/'scripts/update_benchmark_ytd.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BenchmarkYtdTests(unittest.TestCase):
    def test_common_cutoff_and_year_end(self):
        sp = {'2025-12-31':100, '2026-10-15':110, '2026-10-16':120}
        nas = {'2025-12-31':200, '2026-10-15':180}
        result = module.build(sp,nas,'2026-10-15')
        self.assertAlmostEqual(result['benchmarks']['sp500']['return'],0.1)
        self.assertAlmostEqual(result['benchmarks']['nasdaq']['return'],-0.1)
        self.assertEqual(result['asOf'],'2026-10-15')
        with self.assertRaises(ValueError):module.build(sp,nas,'2026-10-16')
        with self.assertRaises(ValueError):module.build({'2026-10-15':110},nas,'2026-10-15')
        with self.assertRaises(ValueError):module.build({**sp,'2026-10-15':float('nan')},nas,'2026-10-15')
