# Historical Top 10 research catalogue

`data/research/top10-history.json` is a dedicated static catalogue for 1958–2026. Rebuild with `python3 scripts/build_top10_history.py`.

Coverage now includes 300 sample ranking rows across 1996–2025, plus ten 2026 YTD sample rows as of the actual source endpoint 2026-10-15. These are incomplete available-sample rankings, not certified historical S&P top tens. The 2023–2025 source has 473/486/477 historical year-end members with complete endpoints. Its close adjustment and dividend convention is undocumented. A current survivor-price dataset is intersected with actual historical members, never used as a substitute for the historic universe.

The 2026 close-ratio sample has 492 eligible symbols. It is stored separately from complete-year records and may extend a requested current-year strategy with an explicit YTD cutoff. Sample dates, source hash, excluded securities and reported evidence stay explicit. Some YTD screens report materially different numbers; no attempt is made to average or silently reconcile them.

Historical observations for 1980, 1982 and 1991 are partial author-reported top-ten members with no within-year ranks inferred. 2023 FAST Graphs membership is alphabetical. 2025 Benzinga/Slickcharts year-end reporting is retained separately, including partial-year listing SNDK. No permission for redistributing the underlying reported market data has been established, so these observations remain in the local research catalogue, outside public assets.

1958–1995 numeric full-year rankings remain unavailable; partial evidence does not close those gaps. Original immutable stock snapshot 9bf6ebd73f3563a4 is preserved. Recent extension snapshot 02ef3011b7aca424 is retained; the reviewed THC correction produces dfa68874e9975e30. URLs with `snapshot=1` and version hashes continue to use historical snapshots; ordinary URLs automatically load the latest data. The page offers an explicit latest-data link.

Reproduce the recent extension with `python3 scripts/extend_recent.py` after downloading the public dataset ZIP and metadata into `data/raw/base/kaggle-recent.zip` and `kaggle-metadata.json`. Source URL is recorded in the script; uploader declares CC0. No raw daily prices are published. Both year-end trading dates are required; absolute adjacent daily changes above 50% quarantine that symbol-year. Smaller splices and identity errors may remain.

Monthly fetching and year rollover remain future work. No scheduled refresh is active; reviewed annual archives must not be replaced without an audited revision.

The latest integrity pass adds a separate historical donor, replaces the known-spliced 2020 source year consistently, fills missing 2021/2022/2023/2024 endpoints, and quarantines unresolved cross-source differences and reused IR identities. Use the latest manifest for the active version; earlier hashes above describe preserved historical snapshots. `public/data/integrity.json` and `docs/HOLDING-GAPS.csv` expose remaining gaps.
