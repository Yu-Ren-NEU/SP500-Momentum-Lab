# Private historical stock import format

No CRSP subscription or automatic WRDS security-data download is available. This importer prepares lawfully obtained annual inputs; it cannot reconstruct missing market history. Licensed database content must not enter public assets or repositories without redistribution permission.

## annual.csv

```csv
year,id,ticker,name,total_return,coverage_start,coverage_end,source,corporate_actions_reviewed,delisting_reviewed
```

- `id`: permanent security identity, such as a CRSP PERMNO string. Ticker alone is insufficient.
- `total_return`: decimal, not a percent string. `0.1` means 10%; `-1` means total loss. Missing, non-finite and below-minus-one values are rejected.
- `coverage_start/end`: previous December 31 through the current December 31, inclusive wealth-accounting boundaries. Actual observations must use appropriate trading dates.
- `source`: traceable version, query and review identifier.
- Both review flags must be the string `true`.
- Supply next-year returns for selected holdings even after index exit.

Before export, resolve dividend reinvestment, splits, spinoffs, merger consideration, delisting returns and subsequent cash. A raw close-price ratio does not meet this strict format. Unknown returns remain unknown.

For legacy CRSP RET and DLRET, `(1+RET)*(1+DLRET)-1` is appropriate only after confirming period definitions and avoiding double counting. CIZ conventions differ. The importer does not automatically combine them or impose arbitrary delisting losses.

## membership.csv

```csv
id,start,end,source
```

Dates are ISO and inclusive. Normalize exclusive endpoints and effective trading dates before export. Year-end membership determines the candidate universe. Teaching change excerpts and today's constituents are not substitutes.

## audit.json

Structural example only, not market data:

```json
{
  "reviewer": "Reviewer or review-process identifier",
  "licenseEvidence": "Lawful-use basis; raw files remain local",
  "years": {
    "1957": {
      "source": "Review record for the complete universe and total returns",
      "completePointInTimeUniverse": true,
      "expectedMembers": 500,
      "excludedIncompleteYearIds": []
    }
  }
}
```

`expectedMembers` is the independently verified security count, not necessarily 500. The example is not a historical assertion. An incomplete-year IPO may be explicitly excluded, with its effect on the strategy universe disclosed. Other missing returns must not be excluded merely to pass validation.

## Output and browser use

Default output: `data/private/stocks.json`, with `redistribution=local-only`. Schema: `public/data/stock-schema.json`.

The browser reads the file into current-tab memory through a file input. It does not upload, persist in localStorage, embed in a URL or copy to public assets. Reloading requires reimport. Any other user needs independent lawful access to the same private input.

Validation checks structure, finite numbers, identities, counts, boundaries and missing values. It cannot verify the truth of a source, actual licensing rights or completeness of delisted constituents.
