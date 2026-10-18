import test from "node:test";
import assert from "node:assert/strict";
import {
  strategy,
  sampleStrategy,
  strategyWithYtd,
  benchmark,
  metrics,
  readConfig,
  configSearch,
  assertStockData,
  rankingFor,
  UNIVERSE,
} from "../src/engine.ts";
// All securities below are synthetic math fixtures, never shipped as market data.
const stock = (id, r) => ({
  id,
  ticker: "TEST-" + id,
  name: "Synthetic fixture",
  totalReturn: r,
  source: "synthetic-test-only",
});
const rank = (year, rows) => ({
  status: "reviewed",
  asOf: `${year}-12-31`,
  universe: UNIVERSE,
  source: "synthetic-test-only",
  count: rows.length,
  rows,
});
function fixture() {
  const rows = Array.from({ length: 10 }, (_, i) =>
    stock(String(i), 1 - i * 0.1),
  );
  return {
    schemaVersion: 1,
    redistribution: "local-only",
    licenseEvidence: "synthetic math fixtures",
    rankings: {
      2000: rank(2000, rows),
      2001: rank(
        2001,
        [...rows].reverse().map((r, i) => ({ ...r, totalReturn: 2 - i * 0.1 })),
      ),
    },
    returns: {
      2001: rows.map((r, i) => ({
        ...r,
        totalReturn: i === 0 ? 0.5 : i === 1 ? -0.5 : 0,
      })),
      2002: rows.map((r) => ({ ...r, totalReturn: r.id === "9" ? 1 : 0 })),
    },
  };
}
const c = { start: 2001, end: 2002, initial: 10000, n: 1 };
const close = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} differs from ${b}`);
test("previous year signals, stable ID, annual rotation and compounding", () => {
  const d = fixture();
  const r = strategy(d, c);
  assert.equal(r.error, undefined);
  assert.equal(r.final, 30000);
  close(r.cagr, Math.sqrt(3) - 1);
  assert.deepEqual(
    r.annual.map((a) => a.holdings[0].id),
    ["0", "9"],
  );
  assert.equal(r.maxDrawdown, 0);
});
test("equal-weight annual buy-and-hold is mean of returns, not monthly equal-weight", () => {
  const r = strategy(fixture(), { ...c, end: 2001, n: 2 });
  close(r.final, 10000);
  close(r.annual[0].holdings[0].weight, 0.5);
  close(r.annual[0].holdings[0].endValue, 7500);
});
test("missing selected security aborts full period, no partial misleading curve", () => {
  const d = fixture();
  d.returns[2002] = [];
  const r = strategy(d, c);
  assert.match(r.error, /总回报缺失/);
  assert.deepEqual(r.annual, []);
  assert.equal(r.final, null);
});
test("delisting/terminal return of -100% is valid, never treated as missing", () => {
  const d = fixture();
  d.returns[2001][0].totalReturn = -1;
  const r = strategy(d, c);
  assert.equal(r.final, 0);
  assert.equal(r.maxDrawdown, -1);
  assert.equal(r.cagr, -1);
});
test("missing prior-year ranking rejects strategy", () =>
  assert.match(strategy(undefined, c).error, /2000/));
test("invalid numeric return, duplicate identities and current-universe input rejected", () => {
  for (const bad of [NaN, Infinity, -1.01]) {
    const d = fixture();
    d.returns[2001][0].totalReturn = bad;
    assert.throws(() => assertStockData(d));
  }
  const d = fixture();
  d.rankings[2000].rows[1].id = "0";
  assert.throws(() => rankingFor(d, 2000));
  const e = fixture();
  e.rankings[2000].universe = "today-members";
  assert.match(strategy(e, c).error, /口径/);
});
test("ranking sorted internally with deterministic ties; caller order does not decide winners", () => {
  const d = fixture();
  d.rankings[2000].rows.reverse();
  assert.equal(strategy(d, c).annual[0].holdings[0].id, "0");
});
test("annual max drawdown includes original capital peak", () => {
  close(
    metrics(
      [
        { year: 2000, return: -0.5, value: 5000 },
        { year: 2001, return: 0.2, value: 6000 },
      ],
      10000,
    ).maxDrawdown,
    -0.5,
  );
});
test("NASDAQ starts only on first full available calendar year, with its own initial capital", () => {
  const d = {
    benchmarks: {
      nasdaq: { 1972: { return: 0.1 }, 1973: { return: -0.2 } },
      sp500: {},
    },
  };
  const r = benchmark("nasdaq", d, {
    start: 1958,
    end: 1973,
    initial: 10000,
    n: 3,
  });
  assert.equal(r.start, 1972);
  assert.equal(r.final, 8800);
  assert.equal(r.annual.length, 2);
});
test("missing benchmark year never carries through", () => {
  const r = benchmark(
    "sp500",
    { benchmarks: { sp500: { 2001: { return: 0.1 }, 2003: { return: 0.1 } } } },
    { ...c, end: 2003 },
  );
  assert.match(r.error, /2002/);
  assert.equal(r.final, null);
});
test("share URL roundtrip, integer validation, malformed and future settings rejected", () => {
  assert.deepEqual(readConfig(configSearch(c, "abc"), 2025), c);
  for (const q of [
    "?start=2020&end=2010",
    "?initial=0",
    "?n=11",
    "?start=1958.5",
    "?end=3000",
    "?initial=NaN",
  ])
    assert.throws(() => readConfig(q, 2025));
});
test("Top 1 through 10 produce exactly N equal positions", () => {
  for (let n = 1; n <= 10; n++) {
    const r = strategy(fixture(), { ...c, end: 2001, n });
    assert.equal(r.annual[0].holdings.length, n);
    close(
      r.annual[0].holdings.reduce((s, h) => s + h.weight, 0),
      1,
    );
  }
});
test("default N is 1 and explicit shared N is preserved", () => {
  assert.equal(readConfig("", 2025).n, 1);
  assert.equal(readConfig("?n=7", 2025).n, 7);
});
test("exploratory public sample requires explicit opt-in and cannot pass strict review", () => {
  const d = fixture();
  d.quality = "exploratory";
  for (const rank of Object.values(d.rankings)) {
    rank.status = "provisional";
    rank.universe = "historical-members-available-sample";
  }
  assert.match(strategy(d, c).error, /未核验/);
  assert.equal(strategy(d, c, 1, true).final, 30000);
  assert.throws(() => assertStockData(d));
});

test("exploratory series stops before missing holding year, never bridges gap", () => {
  const d = fixture();
  d.quality = "exploratory";
  d.startYear = 2000;
  d.endYear = 2002;
  for (const rank of Object.values(d.rankings)) {
    rank.status = "provisional";
    rank.universe = "historical-members-available-sample";
  }
  d.returns[2002] = [];
  const r = sampleStrategy(d, c);
  assert.equal(r.end, 2001);
  assert.equal(r.final, 15000);
  assert.equal(r.annual.length, 1);
  assert.match(r.coverageNote, /2002/);
});

test("rank weights compound weighted buy-and-hold returns and survive URLs", () => {
  const data = fixture();
  const weighted = {...c, n:2, weights:[.7,.3]};

  const result = strategy(data, weighted);
  assert.equal(result.error, undefined);
  close(result.annual[0].return, .2);
  close(result.final, 20400);
  for (const annual of result.annual) {
    close(annual.holdings[0].weight,.7);
    close(annual.holdings[1].weight,.3);
    close(annual.return, annual.holdings[0].totalReturn*.7+annual.holdings[1].totalReturn*.3);
  }
  assert.deepEqual(readConfig(configSearch(weighted),2002),weighted);
  assert.throws(() => strategy(data,{...weighted, weights:[.7,.4]}));
});

test("YTD uses prior-year signals and fractional-year CAGR without extending benchmarks", () => {
  const year = new Date().getUTCFullYear();
  const row = stock("A", .1);
  const universe=[row,...Array.from({length:9},(_,i)=>stock("other"+i,0))];
  const data = {schemaVersion:1, redistribution:"local-only",licenseEvidence:"synthetic",rankings:{
    [year-2]:rank(year-2,universe),[year-1]:rank(year-1,universe)
  },returns:{[year-1]:[{...row,totalReturn:.5}]}};
  const ytd = {schemaVersion:1,kind:"stocks-ytd",year,asOf:`${year}-07-01`,version:"test",returns:[row]};
  const config = {start:year-1,end:year,initial:1,n:1};
  const result = strategyWithYtd(data,config,ytd);
  assert.equal(result.error,undefined);
  close(result.final,1.65);
  const fraction=(Date.UTC(year,6,1)-Date.UTC(year,0,1))/(Date.UTC(year+1,0,1)-Date.UTC(year,0,1));
  close(result.cagr,Math.pow(1.65,1/(1+fraction))-1);
  assert.equal(result.asOf,`${year}-07-01`);
  const references={benchmarks:{sp500:{[year-1]:{return:.1,source:"test",basis:"total_return"}}}};
  const reference=benchmark("sp500",references,config);
  assert.equal(reference.end,year-1);
  assert.equal(reference.annual.length,1);
});

test("benchmark YTD compounds once, uses fractional CAGR, and supports a current-year-only window", () => {
  const year = new Date().getUTCFullYear();
  const data = {benchmarks:{sp500:{[year-1]:{return:0.1}},nasdaq:{[year-1]:{return:0.2}}}};
  const ytd = {kind:"benchmarks-ytd",year,asOf:`${year}-06-30`,benchmarks:{
    sp500:{return:0.05,from:`${year-1}-12-31`,to:`${year}-06-30`,basis:"total_return"},
    nasdaq:{return:-0.1,from:`${year-1}-12-31`,to:`${year}-06-30`,basis:"price_return"},
  }};
  const config = {start:year-1,end:year,initial:100,n:1};
  const sp = benchmark("sp500",data,config,ytd);
  assert.equal(sp.error,undefined);
  assert.ok(Math.abs(sp.final-115.5)<1e-10);
  assert.equal(sp.asOf,ytd.asOf);
  const fraction=(Date.parse(ytd.asOf+"T00:00:00Z")-Date.UTC(year,0,1))/(Date.UTC(year+1,0,1)-Date.UTC(year,0,1));
  assert.ok(Math.abs(sp.cagr-(1.155**(1/(1+fraction))-1))<1e-12);
  assert.equal(benchmark("nasdaq",data,{...config,start:year},ytd).final,90);
  assert.equal(benchmark("sp500",data,config).end,year-1);
  assert.equal(benchmark("sp500",data,config,{...ytd,year:year-1}).end,year-1);
  assert.equal(benchmark("sp500",data,{...config,end:year-1},ytd).annual.length,1);
  assert.equal(benchmark("sp500",data,config,{...ytd,benchmarks:{...ytd.benchmarks,sp500:{...ytd.benchmarks.sp500,basis:"price_return"}}}).end,year-1);
});
