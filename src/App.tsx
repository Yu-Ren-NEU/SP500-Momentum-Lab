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
import type { BenchmarkYtd, Config, PublicData, Result, StockData, YtdData } from "./engine";
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
  const [indexYtd, setIndexYtd] = useState<BenchmarkYtd>();
  const [latestBaseVersion, setLatestBaseVersion] = useState<string>();
  const [weightDraft, setWeightDraft] = useState<string[]>(["100"]);
  const [hiddenLines, setHiddenLines] = useState<string[]>([]);
  const [addedCurves, setAddedCurves] = useState<{id:number;n:number;weights:number[]}[]>([]);
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
      p.get("snapshot") === "1" ? Promise.resolve(undefined) : get("/data/benchmarks-ytd.local.json", true).catch(() => undefined),
      p.get("snapshot") === "1" ? Promise.resolve(undefined) : get("/data/stocks-price.local.json", true).catch(() => undefined),
      p.get("snapshot") === "1" ? Promise.resolve(undefined) : get("/data/stocks-price-ytd.local.json", true).catch(() => undefined),
    ])
      .then(([d, legacyBase, legacyCurrent, latest, indices, priceBase, priceYtd]) => {
        const priceMode = priceBase?.basis === "split_adjusted_price_return";
        const s = priceMode ? priceBase : legacyBase;
        const current = priceMode ? (priceYtd?.basis === "split_adjusted_price_return" ? priceYtd : undefined) : legacyCurrent;
        if (indices?.kind === "benchmarks-ytd") setIndexYtd(indices);
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
          const firstYear = (s?.startYear ?? 1996) + 1;
          if (c.start < firstYear) {
            c.start = firstYear;
            c.end = Math.max(c.end, firstYear);
            p.set("start", String(c.start)); p.set("end", String(c.end));
            history.replaceState(null, "", "?" + p.toString() + location.hash);
          }
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
    const calculate = (c: Config): Result => !privateData && base?.quality === "exploratory"
      ? strategyWithYtd(base, c, ytd) : strategy(stocks, c);
    const selected = {...calculate(config), key:"custom", label:`Customize · Top ${config.n}`};
    const preset = (n: number): Result => ({
      ...calculate({...config,n,weights:Array.from({length:n},()=>1/n)}),
      key:`top${n}-equal`, label:`Top ${n} · ${lang === "zh" ? "等权" : "Equal weight"}`,
    });
    return [selected, benchmark("sp500", data, config, indexYtd),
      benchmark("nasdaq", data, config, indexYtd), preset(1), preset(3),
      ...addedCurves.map(curve => ({...calculate({...config,n:curve.n,weights:curve.weights}),
        key:`custom-${curve.id}`,label:`${lang === "zh" ? "自定义" : "Custom"} ${curve.id} · Top ${curve.n} (${curve.weights.map(w=>Number((w*100).toFixed(2))).join("/")}%)`}))];
  }, [data, config, stocks, base, privateData, ytd, indexYtd, lang, addedCurves]);
  const chartResults = results.length ? [results[1],results[2],results[3],results[4],...results.slice(5)] : [];
  const selected = results[0],
    sp = results[1],
    nas = results[2];
  function addCurve() {
    if (!config || error || addedCurves.length >= 5) return;
    const id = [1,2,3,4,5].find(id=>!addedCurves.some(curve=>curve.id===id))!;
    setAddedCurves(curves=>[...curves,{id,n:config.n,weights:[...(config.weights ?? Array.from({length:config.n},()=>1/config.n))]}]);
    setHiddenLines(keys=>keys.filter(key=>key!==`custom-${id}`));
  }
  function deleteCurve(key:string) {
    setAddedCurves(curves=>curves.filter(curve=>`custom-${curve.id}`!==key));
    setHiddenLines(keys=>keys.filter(value=>value!==key));
  }
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
  const firstStartYear = privateData ? (privateData.startYear ?? 1957) + 1 : (base?.startYear ?? 1996) + 1;
  const allYears = config
    ? Array.from(
        { length: config.end - config.start + 1 },
        (_, i) => config.end - i,
      )
    : [];
  const sampled = !privateData && base?.quality === "exploratory";
  const priceOnly = stocks?.basis === "split_adjusted_price_return";
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
                className="theme-toggle"
                onClick={switchTheme}
                aria-label={
                  lang === "zh" ? "切换明暗主题" : "Toggle color theme"
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d={theme === "dark" ? "M12 4a8 8 0 0 0 0 16V4Z" : "M12 4a8 8 0 0 1 0 16V4Z"} fill="currentColor" stroke="none" />
                </svg>
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
                {years.filter(y => y >= firstStartYear).map((y) => (
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
                {years.filter(y => y >= Math.max(firstStartYear, Number(draft.start))).map((y) => (
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
          {!priceOnly && latestBaseVersion && base?.version !== latestBaseVersion && <p className="minor">{lang === "zh" ? "当前链接固定了旧数据快照。" : "This URL pins an older data snapshot."} <a href={(() => { const p = new URLSearchParams(location.search); for (const key of ["snapshot", "data", "base", "ytd"]) p.delete(key); return "?"+p.toString(); })()}>{lang === "zh" ? "加载最新数据 ↗" : "Load latest data ↗"}</a></p>}
          <p className="minor">{lang === "zh" ? `当前策略最早支持 ${firstStartYear} 年，早期历史正在补充。` : `Strategy coverage starts in ${firstStartYear}; earlier history is being researched.`}</p>
          {config?.end === new Date().getUTCFullYear() && <p className="minor">{lang === "zh" ? `本年为 YTD；个股数据截至 ${ytd?.asOf ?? "暂不可得"}。标普（含股息）截至 ${sp?.asOf ?? data.completeThrough}；纳指（价格）截至 ${nas?.asOf ?? data.completeThrough}。${indexYtd ? "指数本年数据仅限本地研究。" : "本年指数数据暂不可得。"}` : `Current year is YTD; stock cutoff: ${ytd?.asOf ?? "unavailable"}. S&P 500 (dividends included): ${sp?.asOf ?? data.completeThrough}; Nasdaq (price): ${nas?.asOf ?? data.completeThrough}. ${indexYtd ? "Index YTD is for local research only." : "Current-year index data unavailable."}`}</p>}
          {sampled && <p className="minor">{t.baseCoverage}: {base?.startYear}—{base?.endYear} · {t.exploratory}{!priceOnly && (base?.endYear ?? 0) >= 2023 && (lang === "zh" ? " · 补充价格数据的复权及分红口径待核实" : " · Supplementary price adjustment/dividend treatment unverified")}</p>}
          {error && (
            <p role="alert" className="error">
              {t.parameterError}
            </p>
          )}
          <div className="plot-meta">
            <div className="legend">
              {chartResults.map((r) => (
                <span className="legend-entry" key={r.key}><button type="button" disabled={!!r.error} aria-pressed={!hiddenLines.includes(r.key)} className={r.error ? "unavailable" : ""} onClick={() => setHiddenLines((keys) => keys.includes(r.key) ? keys.filter((key) => key !== r.key) : [...keys, r.key])}>
                  <i
                    style={{
                      background:
                        r.key === "top3-equal" ? (theme === "dark" ? lineColors.top3 : "#7358a1")
                        : r.key.startsWith("custom-") ? (theme === "dark" ? ["#e5989b","#66c2b5","#e4b875","#84b9e8","#d28bc2"][Number(r.key.slice(7))-1] : ["#a84b58","#227a70","#916317","#326ca0","#914b83"][Number(r.key.slice(7))-1])
                        : r.key === "sp500"
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
                </button>{r.key.startsWith("custom-") && <button className="delete-curve" type="button" aria-label={`${lang === "zh" ? "删除" : "Delete"} ${r.label}`} onClick={()=>deleteCurve(r.key)}>×</button>}</span>
              ))}
            </div>
            <span className="scale-label">USD / {t.linear}</span>
          </div>
          {config && (
            <GrowthChart
              results={chartResults.filter((r) => !hiddenLines.includes(r.key))}
              config={config}
              lang={lang}
              theme={theme}
            />
          )}
          <div className="summary-line">
            <div>
              <span>
                {lang === "zh" ? "当前设置" : "Preview"} · Top {config?.n ?? 1} / {t.final}
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
          <div className="curve-builder">
          <p className="minor">{lang === "zh" ? "设置 Top N 与权重后点击添加曲线，最多保留 5 条；已添加曲线的权重不随之后的编辑变化。" : "Set Top N and weights, then add a curve (up to 5). Added allocations stay fixed when you edit the controls."}</p>
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
            <button type="button" onClick={addCurve} disabled={!!error || !config || addedCurves.length>=5}>{lang === "zh" ? "添加曲线" : "Add curve"} ({addedCurves.length}/5)</button>
            <span role="status">{lang === "zh" ? "合计" : "Total"} {weightDraft.reduce((sum, w) => sum + Number(w), 0).toFixed(2)}%{error ? (lang === "zh" ? " · 须合计 100%，暂保留上次有效结果" : " · Must total 100%; showing last valid result") : ""}</span>
          </div>
          </div>
        </section>
        <section className="annual-section" aria-labelledby="annual-title">
          <div className="annual-intro">
          <div className="section-title">
            <h2 id="annual-title">
              <span>01 / </span>
              {t.annual}
            </h2>
            <span className="minor">{lang === "zh" ? "当前设置" : "Preview"} · Top {config?.n ?? 1}</span>
          </div>
          <ul className="strategy-rules">
            <li>{lang === "zh" ? `每年末，在当年末属于标普 500 的可用历史样本中，按价格涨幅选出前 ${config?.n ?? 1} 名。` : `At each year-end, rank available historical S&P 500 year-end members by price return and select the top ${config?.n ?? 1}.`}</li>
            <li>{lang === "zh" ? "次年年初，将上一年末的全部资金按上方权重买入这些股票；持有至年末再换仓，全部资金复投。默认等权。" : "At the next year’s start, invest the entire prior year-end balance at the weights above. Hold to year-end, then rebalance and reinvest all proceeds. Equal weights by default."}</li>
            <li>{lang === "zh" ? "当年新上市股票也可参与：核实上市起点后，以首个交易日收盘价至年末收盘价计算涨幅，不要求上市满一年。" : "New listings are eligible: after checking their listing endpoint, measure return from the first trading close to year-end. A full year of listing is not required."}</li>
            <li>{priceOnly ? (lang === "zh" ? "个股选股与持仓统一使用拆股调整后的价格收益，不计现金分红、税费、手续费和滑点；不使用含分红的复权收益替代。" : "Stock ranking and holding returns both use split-adjusted price returns, excluding cash dividends, taxes, fees and slippage. Dividend-adjusted returns are not substituted.") : (lang === "zh" ? "当前为旧版或导入数据，尚未确认统一价格口径；不可与新版价格回测直接比较。" : "This legacy or imported dataset has not been confirmed as price-only; do not compare it directly with the new price-return backtest.")}</li>
            <li>{lang === "zh" ? "本年按页面标明的截止日计算 YTD。标普参照线含分红，纳指参照线不含分红，各自口径单独标明。" : "The current year is YTD through the displayed cutoff. The S&P reference includes dividends; the Nasdaq reference excludes dividends, as labeled."}</li>
            <li>{lang === "zh" ? "历史样本仍不完整；缺少持仓收益时停止曲线，不补零、不跳年。退市、收购及分拆等事件未核实的年份不视为完整回报。" : "Historical coverage remains incomplete. Missing holding returns stop the curve; years are never skipped or zero-filled. Unverified delistings, acquisitions and spin-offs are not treated as complete returns."}</li>
          </ul>
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
                      partialPeriods={stocks?.partialListingPeriods}
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
                {priceOnly ? (lang === "zh" ? "本地价格收益样本；不含现金分红，公开分发权限待核实。历史成分与退市事件覆盖仍不完整。" : "Local price-return sample, excluding cash dividends. Redistribution review pending; historical members and terminal events remain incomplete.") : t.exploreNote}{" "}
                {coverage
                  ? `${coverage.available}/${coverage.members} ${lang === "zh" ? "只源表成员有完整年末价格端点" : "members in the source snapshot have complete annual endpoints"}.`
                  : ""}
              </p>
            )}
            {indexYtd && <p>{lang === "zh" ? "本年标普数据使用 S&P 500 Total Return；纳指使用 NASDAQCOM。指数 YTD 仅用于本地研究，公开分发权限待核实。" : "Index YTD uses S&P 500 Total Return and NASDAQCOM. Local research only; redistribution permission remains unestablished."} <a href="https://finance.yahoo.com/quote/%5ESP500TR/history/" target="_blank" rel="noreferrer">S&P 500 TR / Yahoo Finance ↗</a></p>}
            <p>{t.missingNote}</p>
            <p>{lang === "zh" ? "完整历史母集尚未核验。" : "Full historical-universe completeness has not been verified."} <a href={priceOnly ? "/data/price-integrity.local.json" : "/data/integrity.json"} download>{lang === "zh" ? "下载逐年完整性审计 ↗" : "Download year-by-year integrity audit ↗"}</a></p>
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
  partialPeriods,
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
  partialPeriods?: StockData["partialListingPeriods"];
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
                {ranks.some(r => partialPeriods?.[`${year-1}:${r.id.replace("fnspid:", "")}`]) && <p className="minor">{ranks.filter(r => partialPeriods?.[`${year-1}:${r.id.replace("fnspid:", "")}`]).map(r => {
                  const period = partialPeriods![`${year-1}:${r.id.replace("fnspid:", "")}`];
                  return `${r.ticker}: ${period.from} → ${period.to} (${lang === "zh" ? "上市以来，非完整自然年" : "since listing, partial calendar year"})`;
                }).join(" · ")}</p>}
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
