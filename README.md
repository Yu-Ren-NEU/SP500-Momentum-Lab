# SP500 Momentum Lab

A static React + Vite + TypeScript research app, developed and tested on the user's Mac. The interface supports English and Chinese, light and dark themes, Apache ECharts crosshairs, zoom, editable rank weights and annual position details. No backend or database is required.

Repository: https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab

**Public stock records are exploratory available-sample data, not certified historical S&P 500 top-ten rankings.**

## Run locally

Requirements: Node >=22.18, Python >=3.9 and curl. Python scripts use the standard library.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

Open http://127.0.0.1:5173. Keep the development server running, as explicitly requested by the user. Development remains local; Cloudflare deployment and scheduled workflows are deferred.

## Backtest behavior

- Initial capital defaults to USD 1. Top N defaults to 1 and accepts 1 through 10.
- Changes update results immediately. The first row contains dates and capital; the second contains Top N and an editable rank-weight table. Weights default to equal allocation and must sum to 100%.
- At each year boundary, invest the entire portfolio balance in the previous year's top N stocks at the chosen rank weights. Hold for a year, then rebalance and reinvest all proceeds.
- Only the selected strategy and the two index references are shown. Click a legend item to hide or restore its curve.
- Annual details show positions, weights, returns, portfolio value, index returns and excess performance. Expand a year to inspect the preceding year's sample ranking, coverage and missing symbols.
- The default range starts in 2012 and ends at the last complete sample year. Explicit URL parameters preserve the requested configuration.
- The current year is selectable and uses a separate stock YTD snapshot with its cutoff displayed. Available index references currently end in 2025; no current-year index return is fabricated.
- CAGR uses the fractional elapsed calendar year when a YTD point is included. Drawdown checks annual endpoints and the latest YTD point, not daily observations.
- Taxes, fees, slippage, inflation and signal publication delays are excluded. Year-boundary execution is idealized.

## Data coverage

| Source | Coverage | Convention and limitations |
| --- | --- | --- |
| NYU Damodaran | 1958-2025, 68 complete years | S&P annual returns including dividends; not licensed official S&P TRI levels |
| Nasdaq through FRED | 1972-2025, 54 complete years | Nasdaq Composite price return excluding dividends; 1971 starts in February |
| FNSPID and fja05680 historical membership | 1996-2022 signal years | Historical year-end members intersected with exact adjusted-close year-end endpoints |
| Darkmatternet Kaggle dataset and historical members | 2023-2025; 473/486/477 available members | Uploader declares CC0. Close ratios have undocumented dividend/adjustment treatment |
| Separate current-year sample | 2026 through 2026-10-15 | Available close ratios only; explicitly YTD, not a final annual result |

FNSPID is attributed to Dong, Fan and Peng (2024), under its CC BY-NC 4.0 terms for non-commercial research. The membership reconstruction is MIT licensed. Source links, uploader license declarations and hashes accompany published snapshots. License copies are in `docs/licenses/`.

The public sample can omit former members, delistings, mergers, ticker changes and corporate actions. Recent price availability comes from surviving/current companies, intersected with historical membership; this is not a full historic universe and can have selection bias. A ranking alone does not provide the following year's holding returns.

## Quality controls and gaps

Exact year-end trading dates are required. Missing returns are never replaced with zero or another stock. FNSPID's incomplete December 2023 endpoints are not accepted as a full year; the recent extension uses a different source.

Observed adjustment splices in GE, TSLA, AAPL and ETN motivated conservative screening: absolute adjacent moves above 50% quarantine a security-year. This can also exclude genuine market moves. THC's 2010-12-10 rise has a narrowly documented takeover-event exception in `docs/EVENT-REVIEWS.md`; remaining anomaly flags stay in force.

The exploratory curve stops at the first missing holding return. Strict reviewed imports reject the entire requested period when a holding return is missing. Neither mode jumps over a gap. A starting investment year of 1996 requires a 1995 signal, which is currently missing, so the sample's earliest investment year is 1997.

Ordinary URLs load the latest data and preserve configuration, language and weights. Legacy version hashes are removed automatically to avoid stale charts. For deliberate historical reproduction, add `snapshot=1` together with the `data`, `base` and optional `ytd` version hashes. Explicit snapshot mode never silently substitutes a missing annual snapshot. The share button is removed.

## Update and reproduce

```sh
npm run update          # Refresh index data; preserve the old snapshot on failure
npm run update:base     # Rebuild the original source sample from local caches
npm run download:base  # Download the original sources first, approximately 590 MB
npm run update:recent  # Rebuild 2023-2025 and YTD from cached Kaggle files
python3 scripts/review_events.py
npm run update:catalogue
npm run validate
```

The historical supplement and integrity audit are described in [integrity review](docs/INTEGRITY-REVIEW.md). Run `npm run supplement:history` after the original and recent builders, then `npm run update:catalogue`. The audit records every requested year, source conflicts, identity quarantines and missing next-year holding returns.

The recent extension reads `data/raw/base/kaggle-recent.zip` and `kaggle-metadata.json`. Its script records the public Kaggle dataset URL, source hash and uploader license declaration. Raw downloads and private inputs are ignored by Git and excluded from the production website.

Validated patches replace whole years while preserving omitted years and source provenance:

```sh
python3 scripts/build_base.py --patch /absolute/path/validated-patch.json
```

Patches must contain the full available sample, coverage and source information for each replaced year. Empty rankings, incompatible quality tiers, invalid numbers and leaked quarantined returns are rejected. Writes are atomic; immutable snapshots remain in `public/data/base-versions/`.

## Independent historical catalogue

`data/research/top10-history.json` explicitly covers every year from 1958 through 2026. It contains 300 sample top-ten rows for 1996-2025 plus ten YTD sample rows for 2026. Partial older observations and reported lists remain distinct from complete numeric rankings. No complete, usable 1958-1995 stock ranking has been obtained.

Reported market data without established redistribution permission stays in ignored local research files. Public repository evidence retains source links and limitations. Monthly refresh and reviewed year-end archival are not yet automated.

## Private data and verification

Local imports remain in the tab's memory: no upload, URL embedding or localStorage persistence. See [stock import format](docs/STOCK-IMPORT.md), [source research](docs/DATA-RESEARCH.md), [acceptance checks](docs/LOCAL-ACCEPTANCE.md), [catalogue notes](docs/TOP10-CATALOGUE.md) and [delivery checklist](docs/CHECKLIST.md).

Synthetic tests verify arithmetic and safeguards; they do not validate historical market truth. The complete 1958-present, delisting-aware strategy and public deployment remain outstanding.

Current-year benchmark data can be built locally with `npm run update:benchmarks-ytd`.
The script uses S&P 500 Total Return (`^SP500TR`) via Yahoo Finance and Nasdaq
Composite (`NASDAQCOM`) via FRED, requiring a common date matching the stock YTD
cutoff and a prior December year-end endpoint. Run without `--download` to rebuild
from cached raw files. Missing endpoints fail without replacing the previous file.
The resulting `public/data/benchmarks-ytd.local.json` is ignored by Git and removed
from production builds while redistribution permission remains unestablished.
Historical snapshot mode excludes this unpinned local supplement. Annual index
snapshots remain unchanged. YTD CAGR uses the elapsed fraction of the current year.
The start-year menu follows stock coverage (currently 1997); older URLs are clamped
to that first investable year. This does not certify complete universe coverage.

### Unified stock price-return research mode

Run `npm run update:price` locally to rebuild the separate price-only static base.
The builder reads FNSPID `close` (never `adj close`), and independently fetches
Yahoo Finance split-adjusted `Close` observations for available historical members.
It recalculates both rankings and holding returns, rather than correcting only
past winners. Year-end historical membership determines eligibility. New listings
can rank using their first daily trading close in that listing year, checked
against the provider's `firstTradeDate`. Partial listing periods are recorded and
shown when the corresponding ranking is expanded. Missing prices remain missing;
identity conflicts and unavailable terminal proceeds do not become zero returns.

Annual endpoints use completed December bars. Current-year endpoints use daily
observations at the stock cutoff; unfinished monthly bars are never used for YTD.
Donor conventions cannot be mixed within an annual ratio. Old dividend-adjusted
snapshots remain unchanged and are explicitly labeled as legacy data.

The generated `stocks-price.local.json`, `stocks-price-ytd.local.json` and
`price-integrity.local.json` are local research assets excluded from Git and
production builds pending redistribution review. The app uses them when available
outside historical snapshot mode. The storage field `totalReturn` is retained for
engine compatibility; `basis=split_adjusted_price_return` identifies its actual
price-only meaning. No cash dividend or distribution is added to those values.
The S&P reference intentionally remains dividend-inclusive; Nasdaq remains a price
reference, with the distinction explicitly stated in the rule bullets.
