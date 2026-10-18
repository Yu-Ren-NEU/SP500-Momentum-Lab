import { useEffect, useMemo, useRef, useState } from "react";
import {
  assertStockData,
  benchmark,
  configSearch,
  rankingFor,
  readConfig,
  strategy,
  strategyWithYtd,
  validateConfig,
} from "./engine";
import type { Config, PublicData, Result, StockData, YtdData } from "./engine";
import GrowthChart, { lineColors, seriesLabel } from "./GrowthChart";
import { copy, formatMoney, formatPct, type Lang } from "./i18n";
const repo = "https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab";
function initialLang(): Lang {
  const p = new URLSearchParams(location.search).get("lang");
  if (p === "en" || p === "zh") return p;
  try {
    return localStorage.getItem("lang") === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}
export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang),
    [theme, setTheme] = useState(
      document.documentElement.dataset.theme || "dark",
    );
  const t = copy[lang];
  const [data, setData] = useState<PublicData>(),
    [base, setBase] = useState<StockData>(),
    [privateData, setPrivateData] = useState<StockData>(),
    [filename, setFilename] = useState("");
  const [ytd, setYtd] = useState<YtdData>();
  const [latestBaseVersion, setLatestBaseVersion] = useState<string>();
  const [weightDraft, setWeightDraft] = useState<string[]>(["100"]);
  const [hiddenLines, setHiddenLines] = useState<string[]>([]);
  const [config, setConfig] = useState<Config>(),
    [draft, setDraft] = useState({
      start: "2012",
      end: "2025",
      initial: "1",
      n: "1",
    }),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(false),
    [notice, setNotice] = useState(""),
    [expanded, setExpanded] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const ctrl = new AbortController(),
      p = new URLSearchParams(location.search),
      v = p.get("snapshot") === "1" ? p.get("data") : null,
      b = p.get("snapshot") === "1" ? p.get("base") : null,
      ytdVersion = p.get("snapshot") === "1" ? p.get("ytd") : null;
    if (p.get("snapshot") !== "1") {
      for (const key of ["data", "base", "ytd"]) p.delete(key);
      history.replaceState(null, "", "?" + p.toString() + location.hash);
    }
    if ((v && !/^[a-f0-9]{16}$/.test(v)) || (b && !/^[a-f0-9]{16}$/.test(b)) || (ytdVersion && !/^[a-f0-9]{16}$/.test(ytdVersion))) {
      setLoadError(true);
      return;
    }
    const get = async (path: string, optional = false) => {
      const r = await fetch(path, { signal: ctrl.signal });
      if (!r.ok) {
        if (optional && r.status === 404) return undefined;
        throw new Error("Snapshot unavailable");
      }
      if (optional && r.headers?.get("content-type")?.includes("text/html"))
        return undefined;
      return r.json();
    };
    Promise.all([
      get(v ? `/data/versions/${v}.json` : "/data/public.json"),
      get(b ? `/data/base-versions/${b}.json` : "/data/stocks-base.json", !b),
      get(ytdVersion ? `/data/ytd-versions/${ytdVersion}.json` : "/data/stocks-ytd.json", !ytdVersion).catch(() => undefined),
      get("/data/base-latest.json", true).catch(() => undefined),
    ])
      .then(([d, s, current, latest]) => {
        if (d.schemaVersion !== 1 || !d.benchmarks?.sp500)
          throw new Error("Invalid index data");
        if (
          s &&
          (s.quality !== "exploratory" ||
            !s.version ||
            !s.rankings ||
            !s.returns)
        )
          throw new Error("Invalid stock base");
        if (current?.kind === "stocks-ytd") setYtd(current);
        if (latest?.kind === "stocks-base-manifest") setLatestBaseVersion(latest.version);
        setData(d);
        setBase(s);
        try {
          const c = readConfig(location.search, d.completeThrough);
          if (!p.has("start"))
            c.start = s?.startYear ? Math.max(s.startYear + 1, 2012) : 2012;
          if (!p.has("end")) c.end = s?.endYear ?? d.completeThrough;
          validateConfig(c);
          setConfig(c);
          setWeightDraft(Array.from({length: c.n}, (_, i) => String((c.weights?.[i] ?? 1 / c.n) * 100)));
          setDraft({
            start: String(c.start),
            end: String(c.end),
            initial: String(c.initial),
            n: String(c.n),
          });
        } catch {
          setError("parameters");
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(true);
      });
    return () => ctrl.abort();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = `${copy[lang].title} · Momentum Lab`;
  }, [lang]);
  const stocks = privateData ?? base;
  const results = useMemo(() => {
    if (!data || !config) return [];
    const selected: Result =
      !privateData && base?.quality === "exploratory"
        ? strategyWithYtd(base, config, ytd)
        : strategy(stocks, config);
    return [
      selected,
      benchmark("sp500", data, config),
      benchmark("nasdaq", data, config),
    ];
  }, [data, config, stocks, base, privateData, ytd]);
  const selected = results[0],
    sp = results[1],
    nas = results[2];
  function url(c: Config) {
    const snapshot = new URLSearchParams(location.search).get("snapshot") === "1";
    const p = new URLSearchParams(configSearch(c, snapshot ? data?.version : undefined));
    if (snapshot) p.set("snapshot", "1");
    p.set("lang", lang);
    if (snapshot && !privateData && base?.version) p.set("base", base.version);
    if (snapshot && c.end === new Date().getUTCFullYear() && ytd?.version) p.set("ytd", ytd.version);
    return location.origin + location.pathname + "?" + p.toString();
  }
  function updateOptions(next: typeof draft, allocation?: string[]) {
    setDraft(next);
    const changedN = next.n !== draft.n;
    const weights = allocation ?? (changedN ? Array.from({length: Number(next.n)}, () => String(100 / Number(next.n))) : weightDraft);
    setWeightDraft(weights);
    const c = {
      weights: weights.map(w => w.trim() === "" ? NaN : Number(w) / 100),
      start: Number(next.start),
      end: Number(next.end),
      initial: Number(next.initial),
      n: Number(next.n),
    };
    try {
      validateConfig(c);
      setConfig(c);
      setError("");
      setNotice("");
      history.replaceState(null, "", url(c));
    } catch {
      setError("parameters");
    }
  }
  function switchLang() {
    const next = lang === "zh" ? "en" : "zh";
    setLang(next);
    setNotice("");
    try {
      localStorage.setItem("lang", next);
    } catch {}
    const p = new URLSearchParams(location.search);
    p.set("lang", next);
    history.replaceState(null, "", "?" + p.toString() + location.hash);
  }
  function switchTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20e6) throw new Error(t.fileLimit);
      const d: unknown = JSON.parse(await file.text());
      assertStockData(d);
      setPrivateData(d);
      setFilename(file.name);
      setNotice(t.imported);
    } catch (e) {
      setNotice(
        t.importError +
          (lang === "en"
            ? "Invalid or incomplete stock dataset."
            : (e as Error).message),
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  function exportCSV() {
    if (!config) return;
    const rows = [
      [
        "year",
        "top_" + config.n + "_return",
        "strategy_USD",
        "sp500_return",
        "nasdaq_return",
      ],
    ];
    for (let y = config.start; y <= config.end; y++) {
      const a = selected?.annual.find((a) => a.year === y);
      rows.push([
        String(y),
        String(a?.return ?? ""),
        String(a?.value ?? ""),
        String(sp?.annual.find((a) => a.year === y)?.return ?? ""),
        String(nas?.annual.find((a) => a.year === y)?.return ?? ""),
      ]);
    }
    const text =
      rows.map((r) => r.join(",")).join("\n") +
      "\n\nResearch only; S&P: Damodaran NYU. Nasdaq Inc. via FRED. Stocks: " +
      (base?.sources?.map((s) => s.name).join("; ") || "local input") +
      "\nIndex version: " +
      data?.version +
      "\nStock version: " +
      (privateData ? "private file" : base?.version || "none");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }),
    );
    a.download = "momentum-annual.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  if (loadError)
    return (
      <main className="loading">
        <h1>{t.errorTitle}</h1>
        <p role="alert">{t.unknownVersion}</p>
        <a href="/">{t.retry}</a>
      </main>
    );
  if (!data)
    return (
      <main className="loading" aria-busy="true">
        <h1>
          MOMENTUM LAB<span className="terminal-cursor">_</span>
        </h1>
        <p>Loading static snapshots…</p>
      </main>
    );
  const years = Array.from(
    { length: new Date().getUTCFullYear() - 1958 + 1 },
    (_, i) => 1958 + i,
  );
  const allYears = config
    ? Array.from(
        { length: config.end - config.start + 1 },
        (_, i) => config.end - i,
      )
    : [];
  const sampled = !privateData && base?.quality === "exploratory";
  const coverage =
    base?.coverage?.[
      String(config ? Math.max(config.start - 1, base.startYear ?? 0) : 0)
    ];
  return (
    <>
      <main>
        <header className="page-header">
          <div>
            <span className="wordmark">
              MOMENTUM / LAB<span className="terminal-cursor">_</span>
            </span>
            <h1>{t.title}</h1>
          </div>
          <div className="header-right">
            <p className="disclaimer">{t.disclaimer}</p>
            <div className="utility">
              <button
                onClick={switchTheme}
                aria-label={
                  lang === "zh" ? "切换明暗主题" : "Toggle color theme"
                }
              >
                {theme === "dark" ? "◐" : "◑"}
              </button>
              <button onClick={switchLang}>
                {lang === "zh" ? "EN" : "中文"}
              </button>
              <a href={repo} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
        </header>
        <section className="plot-section" aria-label={t.chart}>
          <form
            className="controls"
            onSubmit={(e) => e.preventDefault()}
          >
            <label>
              {t.start}
              <select
                value={draft.start}
                onChange={(e) => updateOptions({ ...draft, start: e.target.value })}
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              {t.end}
              <select
                value={draft.end}
                onChange={(e) => updateOptions({ ...draft, end: e.target.value })}
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              {t.initial}
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="1000000000000"
                step="any"
                value={draft.initial}
                onChange={(e) =>
                  updateOptions({ ...draft, initial: e.target.value })
                }
              />
            </label>


          </form>
          <div className="weight-controls" role="group" aria-label={lang === "zh" ? "按排名分配权重" : "Weights by prior-year rank"}>
            <label>
              {t.n}
              <select
                value={draft.n}
                onChange={(e) => updateOptions({ ...draft, n: e.target.value })}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <div className="weights-scroll">
              <table className="weights-table">
                <caption className="sr-only">{lang === "zh" ? "按上一年排名设置投资权重" : "Allocation by prior-year rank"}</caption>
                <thead><tr><th scope="col">{lang === "zh" ? "排名" : "Rank"}</th>{weightDraft.map((_, i) => <th scope="col" key={i}>#{i + 1}</th>)}</tr></thead>
                <tbody><tr><th scope="row">{lang === "zh" ? "权重 · %" : "Weight · %"}</th>{weightDraft.map((weight, i) => <td key={i}><input aria-label={`${lang === "zh" ? "第" : "Rank "}${i + 1}${lang === "zh" ? "名权重" : " weight"}`} type="number" min="0" max="100" step="any" value={weight} onChange={e => { const next = [...weightDraft]; next[i] = e.target.value; updateOptions(draft, next); }} /></td>)}</tr></tbody>
              </table>
            </div>
            <button type="button" onClick={() => updateOptions(draft, Array.from({length: Number(draft.n)}, () => String(100 / Number(draft.n))))}>{lang === "zh" ? "恢复等权" : "Equal weights"}</button>
            <span role="status">{lang === "zh" ? "合计" : "Total"} {weightDraft.reduce((sum, w) => sum + Number(w), 0).toFixed(2)}%{error ? (lang === "zh" ? " · 须合计 100%，暂保留上次有效结果" : " · Must total 100%; showing last valid result") : ""}</span>
          </div>
          {latestBaseVersion && base?.version !== latestBaseVersion && <p className="minor">{lang === "zh" ? "当前链接固定了旧数据快照。" : "This URL pins an older data snapshot."} <a href={(() => { const p = new URLSearchParams(location.search); for (const key of ["snapshot", "data", "base", "ytd"]) p.delete(key); return "?"+p.toString(); })()}>{lang === "zh" ? "加载最新数据 ↗" : "Load latest data ↗"}</a></p>}
          {config?.end === new Date().getUTCFullYear() && <p className="minor">{lang === "zh" ? `本年为 YTD；个股数据截至 ${ytd?.asOf ?? "暂不可得"}。两组指数基准暂截至 ${data.completeThrough}，不补造本年指数回报。` : `Current year is YTD; stock cutoff: ${ytd?.asOf ?? "unavailable"}. Both index benchmarks currently end in ${data.completeThrough}; no current-year index return is inferred.`}</p>}
          {sampled && <p className="minor">{t.baseCoverage}: {base?.startYear}—{base?.endYear} · {t.exploratory}{(base?.endYear ?? 0) >= 2023 && (lang === "zh" ? " · 补充价格数据的复权及分红口径待核实" : " · Supplementary price adjustment/dividend treatment unverified")}</p>}
          {error && (
            <p role="alert" className="error">
              {t.parameterError}
            </p>
          )}
          <div className="plot-meta">
            <div className="legend">
              {results.map((r) => (
                <button type="button" key={r.key} disabled={!!r.error} aria-pressed={!hiddenLines.includes(r.key)} className={r.error ? "unavailable" : ""} onClick={() => setHiddenLines((keys) => keys.includes(r.key) ? keys.filter((key) => key !== r.key) : [...keys, r.key])}>
                  <i
                    style={{
                      background:
                        r.key === "sp500"
                          ? theme === "dark"
                            ? lineColors.sp500
                            : "#42698e"
                          : r.key === "nasdaq"
                            ? theme === "dark"
                              ? lineColors.nasdaq
                              : "#927122"
                            : theme === "dark"
                              ? lineColors.strategy
                              : "#3e6c37",
                    }}
                  />
                  {seriesLabel(r, lang)}
                  {r.error ? " · —" : ""}
                </button>
              ))}
            </div>
            <span className="scale-label">USD / {t.linear}</span>
          </div>
          {config && (
            <GrowthChart
              results={results.filter((r) => !hiddenLines.includes(r.key))}
              config={config}
              lang={lang}
              theme={theme}
            />
          )}
          <div className="summary-line">
            <div>
              <span>
                TOP {config?.n ?? 1} / {t.final}
              </span>
              <strong>{formatMoney(selected?.final ?? null, lang)}</strong>
            </div>
            <div>
              <span>{t.cagr}</span>
              <strong>{formatPct(selected?.cagr ?? null)}</strong>
            </div>
            <div>
              <span>{t.drawdown}</span>
              <strong>{formatPct(selected?.maxDrawdown ?? null)}</strong>
            </div>
            <div>
              <span>{t.period}</span>
              <strong>
                {selected && !selected.error
                  ? `${selected.start}—${selected.end}${selected.asOf ? " YTD " + selected.asOf : ""}`
                  : "—"}
              </strong>
            </div>
          </div>
          <div className="status-line" role="status">
            {notice && <span>{notice} · </span>}
            {selected?.error
              ? lang === "zh"
                ? `Top ${config?.n}：${selected.error === "missing" ? t.noData : selected.error}`
                : "Strategy unavailable: a required annual ranking or holding return is missing."
              : sampled
                ? t.exploratory
                : privateData
                  ? t.complete
                  : t.empty}
            {selected &&
            !selected.error &&
            config &&
            (selected.start !== config.start || selected.end !== config.end)
              ? ` · ${t.strategyRange} ${selected.start}—${selected.end}${selected.coverageNote ? " · " + selected.coverageNote : ""}`
              : ""}
          </div>
        </section>
        <section className="annual-section" aria-labelledby="annual-title">
          <div className="annual-intro">
          <div className="section-title">
            <h2 id="annual-title">
              <span>01 / </span>
              {t.annual}
            </h2>
            <span className="minor">TOP {config?.n ?? 1}</span>
          </div>
          <p>{lang === "zh" ? `每年年初，将上一年末的全部资金，按上方权重买入上一年度涨幅前 ${config?.n ?? 1} 支股票。持有一年，年底换仓，本金与收益全部复投。首年使用你设定的初始资金。` : `At the start of each year, invest the entire previous year-end balance at your chosen rank weights in the prior year’s top ${config?.n ?? 1} stocks. Hold for one year, then rebalance and reinvest all proceeds. The first year starts with your initial investment.`}</p>
          </div>
          <div className="table-scroll">
            <table className="annual-table">
              <caption className="sr-only">{t.annual}</caption>
              <thead>
                <tr>
                  <th>{t.year}</th>
                  <th>{t.picks}</th>
                  <th>{t.ret}</th>
                  <th>{config?.end === new Date().getUTCFullYear() ? (lang === "zh" ? "年末 / 最新资金" : "Year-end / latest value") : t.value}</th>
                  <th>{t.sp}</th>
                  <th>{t.nas}</th>
                  <th>{t.excess}</th>
                </tr>
              </thead>
              <tbody>
                {allYears.map((y) => {
                  const a = selected?.annual.find((a) => a.year === y),
                    s = sp?.annual.find((a) => a.year === y),
                    n = nas?.annual.find((a) => a.year === y);
                  let ranks: ReturnType<typeof rankingFor> = [];
                  try {
                    ranks = rankingFor(stocks, y - 1, !!sampled).slice(0, 10);
                  } catch {}
                  return (
                    <YearRow
                      key={y}
                      year={y}
                      a={a}
                      spReturn={s?.return}
                      nasReturn={n?.return}
                      ranks={ranks}
                      lang={lang}
                      coverage={
                        sampled ? base?.coverage?.[String(y - 1)] : undefined
                      }
                      open={expanded === y}
                      toggle={() => setExpanded(expanded === y ? null : y)}
                      n={config?.n ?? 1}
                      weights={config?.weights}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section id="quality" className="footnotes">
          <details>
            <summary>
              {t.sourceTitle}
              <span>+</span>
            </summary>
            <p className="method">{t.method}</p>
            <p>{t.benchmarkNote}</p>
            {sampled && (
              <p>
                {t.exploreNote}{" "}
                {coverage
                  ? `${coverage.available}/${coverage.members} ${lang === "zh" ? "只源表成员有完整年末价格端点" : "members in the source snapshot have complete annual endpoints"}.`
                  : ""}
              </p>
            )}
            <p>{t.missingNote}</p>
            <p>{lang === "zh" ? "完整历史母集尚未核验。" : "Full historical-universe completeness has not been verified."} <a href="/data/integrity.json" download>{lang === "zh" ? "下载逐年完整性审计 ↗" : "Download year-by-year integrity audit ↗"}</a></p>
            <div className="source-list">
              <a href={data.sources.nyu.url} target="_blank" rel="noreferrer">
                S&P 500 / NYU Damodaran ↗
              </a>
              <a
                href="https://fred.stlouisfed.org/series/NASDAQCOM"
                target="_blank"
                rel="noreferrer"
              >
                Nasdaq, Inc. / FRED ↗
              </a>
              {base?.sources?.map((s) => (
                <div key={s.name}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name} ↗
                  </a>
                  <small>
                    <a href={s.licenseUrl} target="_blank" rel="noreferrer">
                      {s.license}
                    </a>
                  </small>
                </div>
              ))}
            </div>
            <p className="minor">
              {t.baseline}: {data.version}
              <br />
              {t.baseVersion}: {base?.version ?? "—"}
              <br />
              {t.updated}:{" "}
              {new Date(data.updatedAt).toLocaleString(
                lang === "zh" ? "zh-CN" : "en-US",
                { timeZone: "Asia/Shanghai" },
              )}{" "}
              UTC+8
            </p>
          </details>
          <details>
            <summary>
              {t.tools}
              <span>+</span>
            </summary>
            <div className="tool-buttons">
              <a href={(() => { const p = new URLSearchParams(location.search); p.delete("base"); p.set("end", String(data.completeThrough)); return "?" + p.toString(); })()}>{lang === "zh" ? "加载最新静态样本 ↗" : "Load latest static sample ↗"}</a>
              <button onClick={exportCSV} disabled={!config}>
                {t.export} ↓
              </button>
              <button onClick={() => fileInput.current?.click()}>
                {t.import}
              </button>
              <a href="/data/stock-schema.json" download>
                {t.downloadSchema} ↗
              </a>
              <input
                className="sr-only"
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label={t.fileInput}
                onChange={(e) => importFile(e.target.files?.[0])}
              />
              {filename && (
                <>
                  <span>
                    {t.loaded}
                    {filename}
                  </span>
                  <button
                    onClick={() => {
                      setPrivateData(undefined);
                      setFilename("");
                      setNotice(t.removed);
                    }}
                  >
                    {t.remove}
                  </button>
                </>
              )}
            </div>
            <p>{t.privateNote}</p>
          </details>
        </section>
        <footer>
          <span>MOMENTUM LAB / NON-COMMERCIAL RESEARCH</span>
          <a href={repo} target="_blank" rel="noreferrer">
            {t.sourceCode} ↗
          </a>
        </footer>
      </main>
    </>
  );
}
function YearRow({
  year,
  a,
  spReturn,
  nasReturn,
  ranks,
  lang,
  coverage,
  open,
  toggle,
  n,
  weights,
}: {
  year: number;
  a?: Result["annual"][number];
  spReturn?: number;
  nasReturn?: number;
  ranks: ReturnType<typeof rankingFor>;
  lang: Lang;
  coverage?: { members: number; available: number; missing: string[] };
  open: boolean;
  toggle: () => void;
  n: number;
  weights?: number[];
}) {
  const t = copy[lang];
  return (
    <>
      <tr>
        <th>
          <button
            className="year-toggle"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? t.collapse : t.expand} ${year}`}
          >
            <span>{open ? "−" : "+"}</span>
            {year}{year === new Date().getUTCFullYear() ? " YTD" : ""}
          </button>
        </th>
        <td className="picks">
          {a?.holdings?.map((h) => (
            <span key={h.id}>
              {h.ticker}
              <small>{formatPct(h.weight)}</small>
            </span>
          )) ?? "—"}
        </td>
        <td className={a ? (a.return >= 0 ? "positive" : "negative") : ""}>
          {formatPct(a?.return ?? null)}
        </td>
        <td>{formatMoney(a?.value ?? null, lang)}</td>
        <td>{formatPct(spReturn ?? null)}</td>
        <td>{formatPct(nasReturn ?? null)}</td>
        <td>
          {a && spReturn !== undefined
            ? ((a.return - spReturn) * 100).toFixed(2)
            : "—"}
        </td>
      </tr>
      {open && (
        <tr className="expanded-row">
          <td colSpan={7}>
            {ranks.length ? (
              <>
                <h3>
                  {year - 1} / {t.rank}
                  {coverage
                    ? ` · ${coverage.available}/${coverage.members}`
                    : ""}
                </h3>
                {coverage && coverage.missing.length > 0 && (
                  <p className="minor">
                    {lang === "zh"
                      ? "缺失或异常（未参与排名）："
                      : "Missing or quarantined (excluded): "}
                    {coverage.missing.join(", ")}
                  </p>
                )}
                <div className="rank-list">
                  {ranks.map((r, i) => (
                    <div key={r.id}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <strong>{r.ticker}</strong>
                      <span>{formatPct(r.totalReturn)}</span>
                      <small>
                        {i < n ? `${t.weight} ${formatPct(weights?.[i] ?? 1 / n)}` : "—"}
                      </small>
                    </div>
                  ))}
                </div>
                {a?.holdings && (
                  <p>
                    {year} / {t.position}:{" "}
                    {a.holdings
                      .map(
                        (h) =>
                          `${h.ticker} ${formatMoney(h.startValue, lang)} → ${formatMoney(h.endValue, lang)}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </>
            ) : (
              <p>{t.noRank}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
