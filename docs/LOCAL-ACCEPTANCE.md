# Local acceptance record

Date: 2026-10-18, Asia/Shanghai. Environment: the user's Mac, under Documents/Codex. Public deployment remains deferred.

## Verified behavior

- Engine arithmetic: prior-year signals, annual rotation, compounding, equal and custom rank weights, URL round trips, missing-data safeguards and terminal losses.
- React integration: default capital of USD 1, default N of 1, immediate updates, editable weight table, invalid weights preserving the last valid result, language switching and local imports.
- Browser checks: selected strategy plus both references; legend toggles; Top N in the second row; no share/run buttons; annual explanation and table aligned at the top.
- Earlier desktop and 390px mobile checks covered both themes, keyboard focus, zoom, translated text and document overflow. New YTD and snapshot notices are verified separately during implementation.
- Private import fixtures produce known synthetic results and do not appear in request bodies. File chooser automation was blocked by extension permissions; permissions were not widened.
- Published annual samples pass schema, hash, provenance, coverage and quarantine checks. Raw downloads, private data and WRDS teaching security records are excluded from the site.
- Production TypeScript/Vite build succeeds. The ECharts bundle size warning remains non-blocking.

## Reproducible examples and limits

The NYU 1958-2025 series compounds USD 10,000 to approximately USD 11,589,727.17 using the published annual percentages. This is not a claim of exact official S&P total-return index replication.

The original sample's Top 1 2012-2022 calculation matched an independent Python calculation. The recent extension allows Top 1 through 2025. Agreement of calculations does not prove underlying market-data correctness.

A request beginning in 1996 starts investing in 1997 because the 1995 signal is missing. The original snapshot stopped in 2009 because THC's genuine 2010 takeover jump was quarantined. The reviewed exception restores that return in the latest snapshot, while the old immutable snapshot remains unchanged.

Top 10 still stops before a missing 2020 IR holding return; Top 3/5 can encounter missing former members such as HES. Gaps are not bridged. YTD stock returns use their source cutoff and fractional-year CAGR; current-year index references are unavailable and remain at their last complete year.

No GitHub Actions or Cloudflare deployment acceptance is claimed. Keep the local development server running for the user.

## Historical supplement and integrity audit

The latest pass completes 49 checks: 17 engine tests, 21 Python data/import/publication checks and 11 component tests. Production build succeeds. The historical supplement was rerun and produced the same financial snapshot hash, 9c777259a931d77b.

Real-browser inspection confirms Top 5 annual positions and results through 2025 after filling missing HES, BLDR and other endpoints. Coverage counts reconcile with missing-member lists. Active cross-source conflicts and IR identity blocks are absent from accepted rankings. A stale audit hash is rejected by publication validation. The year-by-year audit is downloadable from the folded sources section.

The complete historic universe remains unverified. QRVO's 2020 holding return is still missing; dated blank rows in another dataset were rejected. No true full-universe historical performance claim is made.
