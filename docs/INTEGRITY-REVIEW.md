# Historical data integrity review

Date: 2026-10-18. This review improves an exploratory sample; it does not certify full historical S&P 500 coverage.

## Supplemental history

Source: [Chickenrobot historical stock snapshot](https://www.kaggle.com/datasets/chickenrobot/historical-stocks-of-companies-of-the-sp-and-500). The uploader declares CC0; metadata, version and file hash are recorded. The source contains former members absent from the newer donor, including HES and BLDR.

The parser requires both exact year-end trading dates, finite positive closes and no unreviewed adjacent move above 50%. Packed strings containing zero or missing fields are excluded. Available price histories are intersected with each year's actual source membership; current membership never replaces historic membership.

Missing 2021, 2022, 2023 and 2024 observations are supplemented without overwriting existing observations. HES's 2023 ratio is within 0.03 percentage points of the independently rounded dividend-reinvestment wealth graph in its issuer annual report. This cross-check supports that observation but does not verify every donor observation.

## 2020 donor replacement

The original FNSPID source has known adjustment splices around July 6, 2020. Comparing a second historical donor exposed widespread annual discrepancies, including smaller discontinuities that a 50% daily threshold cannot catch. The complete available 2020 sample is therefore rebuilt from one internally consistent historical donor, not a mixture of price scales. Original snapshots remain available.

The replacement restores usable TSLA, AAPL and CPRT observations and changes historical rankings and strategy results. It uses close-ratio proxies with undocumented adjustment conventions, not certified CRSP total returns. The [Tesla split announcement](https://ir.tesla.com/press-release/tesla-announces-five-one-stock-split) confirms the actual 2020 corporate event; a raw unadjusted price ratio across the split is unsuitable.

The audit retains 2020 source disagreements with the explicit resolution of using one donor for the known-spliced year. This is a transparent research-source preference, not proof that the replacement source is authoritative.

## Unresolved differences and security identities

Eight remaining cross-source observations in 2023/2024 differ by more than 0.5 percentage points. They are excluded until conventions are reconciled; neither source is silently averaged or selected to improve returns. Prior conflict decisions persist across reruns until reviewed.

Legacy Ingersoll-Rand plc and modern Ingersoll Rand are different issuers sharing a historic ticker. The [issuer transaction release](https://investors.tranetechnologies.com/news-and-events/news-releases/news-release-details/2020/Trane-Technologies-Completes-Reverse-Morris-Trust-Transaction-and-Begins-Trading-Today-on-NYSE/default.aspx) explains the Trane rename, industrial spinoff and Gardner Denver combination. The original IR source visibly splices histories in 2017. IR observations for 2017-2019 are excluded pending permanent-identity reconciliation. A rename alone cannot account for the additional stock distribution in the 2020 transaction.

## Remaining holding gap

QRVO's 2020 return remains unavailable in the accepted donors. A third [Andrew MVD dataset](https://www.kaggle.com/datasets/andrewmvd/sp-500-stocks) contains dated QRVO rows but blank price fields at both endpoints. Row presence is not price coverage; it was rejected as a gap-filling source.

The current Top 1/3/5 sample paths run continuously from 1997 through 2025. Larger N can still stop at QRVO. A continuous sample path does not establish a correct full-universe top ten, account for every delisting, or resolve partial-year IPO eligibility. For example, a stock without the preceding year-end endpoint is excluded even if a published since-IPO leaderboard includes it.

## Reproduce and inspect

Run the source builders, then `python3 scripts/supplement_history.py`, `python3 scripts/review_events.py` and `npm run update:catalogue`. Required caches remain in ignored `data/raw/base/`; raw prices are not published.

- `public/data/integrity.json`: explicit status for every year 1958-2026, observed/source counts, next-year holding availability, unresolved conflicts and identity blocks.
- `docs/HOLDING-GAPS.csv`: exact signal year, holding year, rank and symbol for each missing selected return.
- `data/research/supplement-audit.json`: source hash, supplemental observations and comparison decisions.

Complete historical constituent coverage for 1958-1995 remains unavailable. Every year's `fullUniverseVerified` is false. No completeness claim is made merely because a chart can be drawn.
