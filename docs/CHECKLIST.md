# Delivery checklist

Order requested on 2026-10-18: complete and verify local functionality before deployment workflows. All development runs on the user's Mac.

## Local application

- [x] Confirm local Mac execution and use an independent Git repository
- [x] Follow existing repository naming: SP500-Momentum-Lab
- [x] React, Vite and TypeScript; static architecture without a backend/database
- [x] Date range, initial capital and Top N from 1 through 10
- [x] Selected strategy only, with both index references available
- [x] Editable rank-weight table, equal weights by default, immediate recalculation
- [x] Annual holdings, weights, returns, value and benchmark comparisons
- [x] Compound ending value, CAGR and annual-checkpoint drawdown
- [x] URL configuration and immutable snapshots
- [x] Local-only private file import
- [x] Source, coverage, missing-data and license disclosures
- [x] Python data preparation and validation scripts
- [x] Calculation and integration tests, production build
- [x] English repository documentation and bilingual application UI
- [x] Keep http://127.0.0.1:5173 running for the user's tests

## Data: separate acceptance from software

- [x] NYU dividend-inclusive S&P annual reference, 1958-2025
- [x] FRED Nasdaq Composite price reference, full years 1972-2025
- [x] Available-sample rankings, 1996-2025, with incomplete-universe labels
- [x] Separate 2026 YTD stock sample with explicit cutoff
- [x] Audited THC event exception; preserve other anomaly checks
- [ ] Complete historical point-in-time constituents and top tens from 1957 onward
- [ ] Complete dividend, split, merger and delisting holding returns
- [ ] Independent verification of the complete real-world strategy
- [ ] Current-year index references on explicitly reconciled conventions
- [ ] Monthly refresh and reviewed year-end archival workflow

## Deferred deployment

- [x] Independent repository: https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab
- [ ] GitHub Actions updates with failure preservation
- [ ] Cloudflare Pages Git integration and free pages.dev address
- [ ] Verify automatic deployments and data updates
- [ ] Verify public configuration URLs
- [ ] Document optional custom domains

No paid financial database subscription is available. Do not purchase access or switch development to cloud execution without authorization. The presence of an exploratory sample does not satisfy the full historical-data objective.
