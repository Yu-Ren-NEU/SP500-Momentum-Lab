export type Config = { start: number; end: number; initial: number; n: number; weights?: number[] };
export type ReturnRow = {
  return: number;
  source: string;
  basis: string;
  from?: string;
  to?: string;
};
export type StockRow = {
  id: string;
  ticker: string;
  name: string;
  totalReturn: number;
  source: string;
};
export type Ranking = {
  status: "reviewed" | "provisional";
  asOf: string;
  universe: string;
  source: string;
  count: number;
  rows: StockRow[];
};
export type StockData = {
  schemaVersion: 1;
  quality?: "exploratory";
  version?: string;
  updatedAt?: string;
  startYear?: number;
  endYear?: number;
  coverage?: Record<
    string,
    { members: number; available: number; missing: string[] }
  >;
  sources?: {
    name: string;
    url: string;
    license: string;
    licenseUrl: string;
    sha256: string;
  }[];
  redistribution: "permitted" | "local-only";
  licenseEvidence: string;
  rankings: Record<string, Ranking>;
  returns: Record<string, StockRow[]>;
};
export type PublicData = {
  schemaVersion: 1;
  updatedAt: string;
  completeThrough: number;
  version: string;
  sources: Record<
    string,
    {
      url: string;
      retrievedAt: string;
      sha256: string;
      rights: string;
      rightsUrl: string;
    }
  >;
  updateWarnings: Record<string, string>;
  benchmarks: {
    sp500: Record<string, ReturnRow>;
    nasdaq: Record<string, ReturnRow>;
  };
  research: {
    membershipEvidenceIntervals: number;
    membershipLastEndpoint: string | null;
    notes: string[];
  };
  rankingEvidence: {
    year: number;
    ticker: string;
    returnApprox: number;
    scope: string;
    source: string;
    basis: string;
  }[];
};
export type Holding = StockRow & {
  weight: number;
  startValue: number;
  endValue: number;
};
export type Annual = {
  year: number;
  return: number;
  value: number;
  holdings?: Holding[];
};
export type Result = {
  key: string;
  label: string;
  start: number;
  end: number;
  initial: number;
  annual: Annual[];
  final: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  error?: string;
  coverageNote?: string;
  asOf?: string;
};
export const UNIVERSE = "year-end-sp500-full-year-total-return";
function validReturn(r: unknown): r is number {
  return typeof r === "number" && Number.isFinite(r) && r >= -1;
}
export function validateConfig(c: Config) {
  if (c.weights && (c.weights.length !== c.n || c.weights.some(w => !Number.isFinite(w) || w < 0 || w > 1) || Math.abs(c.weights.reduce((a,b) => a+b, 0) - 1) > 1e-8))
    throw new Error("Weights must be nonnegative and sum to 100%.");
  if (
    !Number.isInteger(c.start) ||
    !Number.isInteger(c.end) ||
    c.start < 1958 ||
    c.end < c.start ||
    c.end > new Date().getUTCFullYear()
  )
    throw new Error("请选择 1958 年起的年份，结束年份不得早于起始年份或晚于本年。");
  if (!Number.isFinite(c.initial) || c.initial <= 0 || c.initial > 1e12)
    throw new Error("初始资金须大于 0，且不超过 1 万亿美元。");
  if (!Number.isInteger(c.n) || c.n < 1 || c.n > 10)
    throw new Error("Top N 须为 1 至 10 的整数。");
}
export function metrics(annual: Annual[], initial: number) {
  if (!annual.length) return { final: null, cagr: null, maxDrawdown: null };
  let peak = initial,
    dd = 0;
  for (const row of annual) {
    peak = Math.max(peak, row.value);
    dd = Math.min(dd, row.value / peak - 1);
  }
  const final = annual.at(-1)!.value;
  return {
    final,
    cagr: Math.pow(final / initial, 1 / annual.length) - 1,
    maxDrawdown: dd,
  };
}
function series(
  key: string,
  label: string,
  start: number,
  end: number,
  initial: number,
  rows: (y: number, value: number) => Omit<Annual, "year" | "value">,
): Result {
  let value = initial;
  const annual: Annual[] = [];
  try {
    for (let y = start; y <= end; y++) {
      const row = rows(y, value);
      if (!validReturn(row.return)) throw new Error(`${y} 年回报缺失或不合法`);
      value *= 1 + row.return;
      if (!Number.isFinite(value)) throw new Error("资金结果超出计算范围");
      annual.push({ year: y, value, ...row });
    }
    return {
      key,
      label,
      start,
      end,
      initial,
      annual,
      ...metrics(annual, initial),
    };
  } catch (e) {
    return {
      key,
      label,
      start,
      end,
      initial,
      annual: [],
      final: null,
      cagr: null,
      maxDrawdown: null,
      error: (e as Error).message,
    };
  }
}
export function benchmark(
  key: "sp500" | "nasdaq",
  data: PublicData,
  c: Config,
  ytd?: BenchmarkYtd,
): Result {
  validateConfig(c);
  const label = key === "sp500" ? "标普 500 · 含股息" : "纳斯达克综合 · 价格";
  const available = Object.keys(data.benchmarks[key])
    .map(Number)
    .sort((a, b) => a - b);
  const start = Math.max(c.start, available[0] ?? c.start);
  const current = new Date().getUTCFullYear();
  const partial = c.end === current && ytd?.kind === "benchmarks-ytd" && ytd.year === current ? ytd.benchmarks[key] : undefined;
  const last = available.at(-1) ?? c.end;
  const includeYtd = partial && last === current - 1 && ytd?.asOf === partial.to &&
    partial.from.startsWith(`${current - 1}-12-`) && partial.to.startsWith(`${current}-`) &&
    partial.basis === (key === "sp500" ? "total_return" : "price_return") && validReturn(partial.return);
  if (start > Math.min(c.end, last) && !includeYtd)
    return {
      key,
      label,
      start,
      end: c.end,
      initial: c.initial,
      annual: [],
      final: null,
      cagr: null,
      maxDrawdown: null,
      error: "所选区间尚无完整自然年数据（纳指完整年度始于 1972 年）",
    };
  const result = series(key, label, start, includeYtd ? current : Math.min(c.end, last), c.initial, (y) => {
    if (y === current && includeYtd) return {return: partial.return};
    const r = data.benchmarks[key][y];
    if (!r) throw new Error(`${y} 年基准数据不可得；未补零或推算`);
    return { return: r.return };
  });
  if (includeYtd && !result.error && result.final !== null) {
    const elapsed = (Date.parse(partial.to + "T00:00:00Z") - Date.UTC(current,0,1)) / (Date.UTC(current+1,0,1)-Date.UTC(current,0,1));
    if (!(elapsed > 0 && elapsed < 1)) throw new Error("Invalid benchmark YTD cutoff");
    result.cagr = Math.pow(result.final / c.initial, 1 / (current-start+elapsed)) - 1;
    result.asOf = partial.to;
  }
  return result;
}
export function rankingFor(
  data: StockData | undefined,
  year: number,
  allowExploratory = false,
): StockRow[] {
  const rank = data?.rankings[year];
  const exploratory = allowExploratory && data?.quality === "exploratory";
  if (
    !rank ||
    (rank.status !== "reviewed" &&
      !(exploratory && rank.status === "provisional"))
  )
    throw new Error(`${year} 年完整历史成分与总回报排名未核验`);
  if (
    rank.universe !==
      (exploratory ? "historical-members-available-sample" : UNIVERSE) ||
    rank.asOf !== `${year}-12-31`
  )
    throw new Error(`${year} 年排名口径或时间点不匹配`);
  if (
    !rank.source ||
    !Array.isArray(rank.rows) ||
    rank.count !== rank.rows.length ||
    rank.count < 10
  )
    throw new Error(`${year} 年排名母集不足或不完整`);
  const ids = new Set<string>();
  for (const row of rank.rows) {
    if (
      typeof row.id !== "string" ||
      !row.id ||
      typeof row.ticker !== "string" ||
      !row.ticker ||
      typeof row.name !== "string" ||
      !row.name ||
      typeof row.source !== "string" ||
      !row.source ||
      ids.has(row.id) ||
      !validReturn(row.totalReturn)
    )
      throw new Error(`${year} 年排名记录无效`);
    ids.add(row.id);
  }
  return [...rank.rows].sort(
    (a, b) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id, "en"),
  );
}
export function strategy(
  data: StockData | undefined,
  c: Config,
  n = c.n,
  allowExploratory = false,
): Result {
  validateConfig({ ...c, n });
  return series(
    `top${n}`,
    `Top ${n}`,
    c.start,
    c.end,
    c.initial,
    (year, value) => {
      const picks = rankingFor(data, year - 1, allowExploratory).slice(0, n);
      const returns = data?.returns[year];
      const holdings = picks.map((pick, index) => {
        const weight = c.weights?.[index] ?? 1 / n;
        const matched = returns?.filter((x) => x.id === pick.id);
        if (
          matched?.length !== 1 ||
          !validReturn(matched[0].totalReturn) ||
          !matched[0].source
        )
          throw new Error(
            `${year} 年 ${pick.ticker} 总回报缺失（含退市/收购处理）`,
          );
        const row = matched[0];
        return {
          ...row,
          ticker: pick.ticker,
          name: pick.name,
          weight,
          startValue: value * weight,
          endValue: value * weight * (1 + row.totalReturn),
        };
      });
      return {
        return: holdings.reduce((s, h) => s + h.totalReturn * h.weight, 0),
        holdings,
      };
    },
  );
}
export function readConfig(search: string, maxYear: number): Config {
  const p = new URLSearchParams(search);
  const get = (k: string, d: number) => (p.has(k) ? Number(p.get(k)) : d);
  const c = {
    start: get("start", 1958),
    end: get("end", maxYear),
    initial: get("initial", 1),
    n: get("n", 1),
  };
  const weights = p.get("weights");
  if (weights !== null) (c as Config).weights = weights.split(",").map(Number);
  validateConfig(c);
  return c;
}
export function configSearch(c: Config, version?: string) {
  validateConfig(c);
  const p = new URLSearchParams({
    start: String(c.start),
    end: String(c.end),
    initial: String(c.initial),
    n: String(c.n),
  });
  if (c.weights) p.set("weights", c.weights.join(","));
  if (version) p.set("data", version);
  return "?" + p.toString();
}
export function assertStockData(input: unknown): asserts input is StockData {
  const d = input as StockData;
  if (
    d?.schemaVersion !== 1 ||
    !["permitted", "local-only"].includes(d.redistribution) ||
    typeof d.licenseEvidence !== "string" ||
    !d.licenseEvidence ||
    typeof d.rankings !== "object" ||
    !d.rankings ||
    typeof d.returns !== "object" ||
    !d.returns
  )
    throw new Error(
      "数据格式不正确，需 schemaVersion=1、来源许可和排名/回报集合。",
    );
  for (const y of Object.keys(d.rankings)) {
    if (!/^\d{4}$/.test(y)) throw new Error("排名年份格式错误");
    rankingFor(d, Number(y));
  }
  for (const [y, rows] of Object.entries(d.returns)) {
    if (!/^\d{4}$/.test(y) || !Array.isArray(rows))
      throw new Error("回报年份格式错误");
    const seen = new Set<string>();
    for (const r of rows) {
      if (
        typeof r.id !== "string" ||
        !r.id ||
        typeof r.ticker !== "string" ||
        !r.ticker ||
        typeof r.name !== "string" ||
        !r.name ||
        seen.has(r.id) ||
        typeof r.source !== "string" ||
        !r.source ||
        !validReturn(r.totalReturn)
      )
        throw new Error(`${y} 年回报记录无效`);
      seen.add(r.id);
    }
  }
}

// Exploratory samples show only a continuous, fully observed prefix. No gap is bridged.
export function sampleStrategy(data: StockData | undefined, c: Config): Result {
  validateConfig(c);
  if (!data || data.quality !== "exploratory") return strategy(data, c);
  const start = Math.max(c.start, (data.startYear ?? c.start - 1) + 1),
    end = Math.min(c.end, data.endYear ?? c.end);
  if (start > end)
    return {
      key: `top${c.n}`,
      label: `Top ${c.n}`,
      start: c.start,
      end: c.end,
      initial: c.initial,
      annual: [],
      final: null,
      cagr: null,
      maxDrawdown: null,
      error: "No sample coverage in the selected period",
    };
  let through = start - 1;
  for (let year = start; year <= end; year++) {
    const one = strategy(data, { ...c, start: year, end: year }, c.n, true);
    if (one.error) {
      if (through < start) return one;
      const result = strategy(data, { ...c, start, end: through }, c.n, true);
      result.coverageNote = one.error;
      return result;
    }
    through = year;
  }
  return strategy(data, { ...c, start, end }, c.n, true);
}

export type YtdData = { schemaVersion:1; kind:"stocks-ytd"; year:number; asOf:string; version:string; returns:StockRow[] };
export function strategyWithYtd(data: StockData | undefined, c: Config, ytd?: YtdData): Result {
  const current = new Date().getUTCFullYear();
  if (c.end !== current || !ytd || ytd.kind !== "stocks-ytd" || ytd.year !== current) return sampleStrategy(data,c);
  if (!data) return sampleStrategy(data,c);
  const combined = {...data, endYear: current, returns:{...data.returns,[current]:ytd.returns}};
  const result = sampleStrategy(combined,c);
  if (!result.error && result.end === current && result.final !== null) {
    const elapsed = (Date.parse(ytd.asOf+"T00:00:00Z")-Date.UTC(current,0,1))/(Date.UTC(current+1,0,1)-Date.UTC(current,0,1));
    const duration = current-result.start+elapsed;
    if (!(elapsed > 0 && elapsed < 1)) throw new Error("Invalid YTD cutoff");
    result.cagr = Math.pow(result.final/result.initial,1/duration)-1;
    result.asOf = ytd.asOf;
  }
  return result;
}

export type BenchmarkYtd = {
  schemaVersion: 1; kind: "benchmarks-ytd"; year: number; asOf: string;
  benchmarks: Record<"sp500" | "nasdaq", {return:number; from:string; to:string; basis:string}>;
};
