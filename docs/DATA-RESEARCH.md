# Sources, coverage and unavailable data

Research date: 2026-10-18, Asia/Shanghai. Downloads and development run on the user's Mac.

| Source | Acquisition | Use and limitations |
| --- | --- | --- |
| [NYU Damodaran](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html) | Downloaded and parsed through 2025 | Annual S&P returns including dividends; use parsed rows rather than the potentially stale page heading |
| [NYU guide](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html) | Read | Attribute the source; no resale; non-commercial research display |
| [FRED NASDAQCOM](https://fred.stlouisfed.org/series/NASDAQCOM) | Daily closes downloaded; annual values derived | Starts 1971-02-05, so complete years start in 1972. Nasdaq Composite, excluding dividends |
| [FRED terms](https://fred.stlouisfed.org/legal/terms/) | Read | Nasdaq copyright restrictions apply; retain attribution and non-commercial educational/personal scope. Do not sell or redistribute raw daily downloads |
| [WRDS classroom](https://wrds-www.wharton.upenn.edu/pages/classroom/the-sp-500/) | Public documentation accessible; full query requires login | Does not provide an authorized full historical constituent dataset to this project |
| [WRDS teaching changes](https://wrds-www.wharton.upenn.edu/classroom/sp500-introduction/over-time/) | Partial teaching intervals parsed locally | 1,889 deduplicated intervals, latest endpoint 2022-12-30. Not full membership. Security records and page HTML are not published |
| [CRSP guide](https://www.crsp.org/crsp_pdf/crsp-historical-indexes-guide/) | Methodology consulted | No licensed security-level return data acquired |
| [S&P 2023 review](https://www.indexologyblog.com/2024/01/22/2023-market-review-for-asian-investors/) | Read | The Nvidia comparison among seven technology stocks does not certify an index-wide total-return ranking |
| S&P December 2023/2024 Market Attributes PDFs | HTTP 403/unavailable | No unread table values inferred |
| [FNSPID](https://huggingface.co/datasets/Zihan1004/FNSPID) | Price ZIP downloaded | CC BY-NC 4.0 academic source, Dong, Fan and Peng (2024); adjusted-close proxies can contain splices |
| [fja05680 history](https://github.com/fja05680/sp500) | Historical snapshots downloaded | MIT reconstruction from 1996; not official or proven complete |
| [Darkmatternet prices](https://www.kaggle.com/datasets/darkmatternet/s-and-p-500-stocks-25-years-of-data-updated-daily) | ZIP and metadata downloaded | Uploader declares CC0. Current/surviving price availability intersected with historic members; close adjustment/dividend treatment undocumented |
| [Slickcharts YTD](https://www.slickcharts.com/sp500/performance) | Current screen inspected | Reported screen lacks a reliable explicit market cutoff in the extracted page. Historical requests previously failed; not substituted for historical constituents |
| Yahoo chart API | HTTP 429 | No bypass or account access attempted |

## Coverage and quality

Annual sample rankings cover 1996-2025. The recent extension observes 473, 486 and 477 source members in 2023, 2024 and 2025. Current-year close ratios are stored separately with their actual source cutoff, 2026-10-15. No final 2026 annual return is asserted.

Exact year-end endpoints are required. Missing securities are disclosed rather than replaced. Current membership is never presented as historical membership; a source containing only survivors remains an incomplete sample even after the historical intersection.

GE, TSLA, AAPL and ETN have observed adjustment discontinuities. Moves above 50% are quarantined pending review; genuine moves can also be excluded. The THC 2010 takeover exception is narrowly reviewed in [event reviews](EVENT-REVIEWS.md).

The initial sample stops before the last trading day in much of 2023, so those observations are not used as a complete year. Recent years come from the separately attributed Kaggle extension, with adjustment uncertainty retained.

## Remaining gaps

The complete 1957 signal universe and 1958-present historical stock rankings remain unavailable. Full delisting, merger, bankruptcy, spinoff, permanent-identifier and cash-settlement handling is unresolved. Partial reported lists and long-period winners must not be promoted into complete annual rankings. No today's-constituent backfill, invented returns, zero filling or arbitrary delisting assumptions are allowed.

Source hashes, conventions and coverage accompany snapshots. Research observations with unresolved redistribution rights remain local; the public repository keeps links and methodological notes. Index arithmetic and synthetic strategy tests can be reproduced, but they do not establish the validity of a full historical strategy.

## Additional historical donor and review

The [Chickenrobot historical snapshot](https://www.kaggle.com/datasets/chickenrobot/historical-stocks-of-companies-of-the-sp-and-500) was downloaded with its uploader CC0 declaration. It supplies exact endpoints missing from the newer survivor dataset, including HES and BLDR. Its columns pack OHLCV, dividends and split fields into strings; zero/empty cells are missing observations, never actual zero prices.

The [Andrew MVD dataset](https://www.kaggle.com/datasets/andrewmvd/sp-500-stocks) was also downloaded. Its QRVO year-end rows contain empty prices, so it does not fill that holding gap. No number was inferred from the row dates alone. See [integrity review](INTEGRITY-REVIEW.md).
