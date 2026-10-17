# Reviewed market-event exceptions

## THC: 2010-12-10

The initial FNSPID sample quarantined THC's 2010 return because adjusted close rose approximately 55.01% between December 9 and December 10. This stopped the prior-year-winner strategy after 2009.

Tenet's [SEC-filed December 9 announcement](https://www.sec.gov/Archives/edgar/data/70318/000119312510277954/dex991.htm) confirms a Community Health Systems takeover proposal at USD 6 per share. [Contemporaneous December 10 coverage](https://www.thestreet.com/investing/stocks/tenet-netflix-premarket-trading-10943938) reports a move above 51% before the open; [healthcare trade coverage](https://www.healthcarefinancenews.com/news/tenet-rejects-33b-buyout-offer-community-health-systems) reports a rise above 50% during trading.

The licensed FNSPID observations have matching close and adjusted-close values around the event. The exception accepts only THC, exactly 2010-12-10, with a source-observed move strictly between 54% and 56%. Additional flagged dates or changed values require another review. It does not accept other large moves or certify the rest of THC's history.

`python3 scripts/review_events.py` reproducibly restores the 2010 ratio from the exact cached 2009/2010 year-end endpoints, updates sample counts, preserves old immutable snapshots and publishes a new version. The original builder contains the same narrowly scoped exception. Its annual return remains an exploratory source-derived proxy.
