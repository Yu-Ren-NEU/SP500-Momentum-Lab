# Free static deployment and monthly updates

Production target: GitHub Pages, using the existing public repository and no extra
account, API token, server or database. Cloudflare Pages remains a possible later
migration; no Cloudflare deployment is claimed. Development stays on the local Mac.

## Deployment

`.github/workflows/deploy.yml` tests and builds on main pushes, manual dispatch,
and successful monthly refresh completion. It uploads only `dist` using the
GitHub Pages artifact/deployment actions and the repository-scoped token plus OIDC.
`DEPLOY_BASE_PATH=/SP500-Momentum-Lab/` makes scripts, data requests and download
links work under the project URL. A shared concurrency group serializes releases.

`npm run audit:release` rejects raw, private and `.local.json` files in the build.
The public edition visibly identifies its source/adjustment limitations and its
difference from the local price-only edition. Local Yahoo-derived price snapshots
and index YTD remain excluded; this release does not establish redistribution rights.

## Monthly refresh

`.github/workflows/monthly-data.yml` runs at 03:17 UTC (11:17 Asia/Shanghai) on the
first day of each month and supports manual dispatch. GitHub can delay scheduled
runs; this is not an exact-time SLA. It fetches the CC0-declared current Kaggle
snapshot, its version/license metadata, historical membership, and public benchmark
sources. The updater runs in a temporary copy, checks source layouts and licensing,
rebuilds the public YTD/catalogue/integrity audit, and validates before publishing.
Failed retrieval, schema/license changes, future/stale cutoffs and regressions fail
the run and preserve committed public data. Whole-year rankings and holding returns
already present in the base are frozen; corrections require an explicit reviewed
change. At year rollover the newly completed year is added; before the first new-year
trading data appears, the last year's separately labeled YTD remains archived and is
not treated as the new year's return. No missing returns are zero-filled.

The workflow commits only allow-listed public outputs. A separate deployment uses
`workflow_run` because commits made by `GITHUB_TOKEN` do not trigger push workflows.
Public-repository schedules may be disabled by GitHub after 60 days of inactivity;
check the Actions page if updates stop. A failing run uses normal GitHub notifications.

## Local verification

- `python3 scripts/monthly_update.py --offline` checks the complete staging pipeline
  using the previously downloaded public-source cache.
- `DEPLOY_BASE_PATH=/SP500-Momentum-Lab/ npm run check` checks the project-path build.
- `python3 scripts/check_release.py --summary` reports public data coverage/cutoffs.
- No raw source cache, authentication token, or local-only research file is committed.

## Verified on 2026-10-18

- Public URL: https://yu-ren-neu.github.io/SP500-Momentum-Lab/ (HTTP 200).
- Initial deployment: https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab/actions/runs/39139217921 (success).
- Live monthly refresh: https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab/actions/runs/39139225624 (success).
- Follow-up deployment triggered by the refresh: https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab/actions/runs/39139274964 (success).
- Stock sample cutoff advanced from 2026-10-15 to 2026-10-16; 30 completed annual samples remained frozen.
- Public browser checks covered loaded charts, Chinese labels, URL configuration,
  immediate end-year recalculation and adding a custom comparison curve.
- Local price-only and index-YTD endpoints return HTTP 404 on the public site.
