import { useEffect, useMemo, useRef, useState } from "react";
import {
  assertStockData,
  benchmark,
  configSearch,
  rankingFor,
  readConfig,
  strategy,
  validateConfig,
} from "./engine";
import type { Config, PublicData, Result, StockData } from "./engine";
const money = (x: number | null) =>
  x === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(x);
const pct = (x: number | null) =>
  x === null ? "—" : `${(x * 100).toFixed(2)}%`;
const colorFor = (key: string) =>
  ({
    top1: "var(--top1)",
    top3: "var(--top3)",
    top5: "var(--top5)",
    top10: "var(--top10)",
    sp500: "var(--sp)",
    nasdaq: "var(--nas)",
  })[key] || "var(--custom)";
const repo = "https://github.com/Yu-Ren-NEU/SP500-Momentum-Lab";
function Chart({
  results,
  config,
  log,
}: {
  results: Result[];
  config: Config;
  log: boolean;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const valid = results.filter((r) => !r.error && r.annual.length);
  const points = valid.flatMap((r) => [
    r.initial,
    ...r.annual.map((a) => a.value),
  ]);
  const useLog = log && points.every((v) => v > 0);
  const transform = (v: number) => (useLog ? Math.log10(v) : v);
  let min = points.length ? Math.min(...points.map(transform)) : 0,
    max = points.length ? Math.max(...points.map(transform)) : 1;
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const W = 1000,
    H = 400,
    left = 85,
    right = 24,
    top = 28,
    bottom = 40;
  const x = (y: number) =>
    left +
    ((y - (config.start - 1)) / (config.end - config.start + 1)) *
      (W - left - right);
  const yp = (v: number) =>
    top + ((max - transform(v)) / (max - min)) * (H - top - bottom);
  const selected =
    cursor === null
      ? null
      : Math.max(config.start - 1, Math.min(config.end, cursor));
  const ticks = Array.from(
    { length: 5 },
    (_, i) => min + ((max - min) * i) / 4,
  );
  const years = Array.from(
    new Set([
      config.start - 1,
      Math.round(config.start + (config.end - config.start) * 0.25),
      Math.round(config.start + (config.end - config.start) * 0.5),
      Math.round(config.start + (config.end - config.start) * 0.75),
      config.end,
    ]),
  );
  return (
    <>
      <div className="chart-wrap" onPointerLeave={() => setCursor(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="资金随年份变化的收益曲线。完整数值见下方年度表现表。"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const sx = ((e.clientX - r.left) / r.width) * W;
            setCursor(
              Math.round(
                config.start -
                  1 +
                  ((sx - left) / (W - left - right)) *
                    (config.end - config.start + 1),
              ),
            );
          }}
        >
          {ticks.map((v, i) => {
            const amount = useLog ? 10 ** v : v;
            const y = top + ((max - v) / (max - min)) * (H - top - bottom);
            return (
              <g key={i}>
                <line
                  x1={left}
                  x2={W - right}
                  y1={y}
                  y2={y}
                  className="grid-line"
                />
                <text x={left - 12} y={y + 4} textAnchor="end" className="axis">
                  {amount >= 1e6
                    ? `${(amount / 1e6).toFixed(1)}m`
                    : amount >= 1000
                      ? `${(amount / 1000).toFixed(0)}k`
                      : Math.max(0, amount).toFixed(0)}
                </text>
              </g>
            );
          })}
          {years.map((y) => (
            <text
              key={y}
              x={x(y)}
              y={H - 10}
              textAnchor="middle"
              className="axis"
            >
              {y}
            </text>
          ))}
          {results.map((r) =>
            r.error ? null : (
              <path
                key={r.key}
                className="curve"
                stroke={colorFor(r.key)}
                d={[{ year: r.start - 1, value: r.initial }, ...r.annual]
                  .map((p, j) => `${j ? "L" : "M"}${x(p.year)},${yp(p.value)}`)
                  .join(" ")}
                strokeDasharray={r.key === "nasdaq" ? "6 5" : undefined}
              />
            ),
          )}
          {selected !== null && (
            <line
              x1={x(selected)}
              x2={x(selected)}
              y1={top}
              y2={H - bottom}
              className="cursor-line"
            />
          )}
        </svg>
      </div>
      <div className="chart-readout" aria-live="polite">
        {selected === null ? (
          "在曲线上移动，查看各年资金。"
        ) : (
          <>
            <strong>{selected} 年末</strong>
            {results.map((r) => {
              const a = r.annual.find((a) => a.year === selected);
              return a ? (
                <span key={r.key} style={{ color: colorFor(r.key) }}>
                  {r.label} {money(a.value)}
                </span>
              ) : null;
            })}
          </>
        )}
      </div>
      {log && !useLog && (
        <p className="note">存在资金归零，对数坐标自动切换为线性坐标。</p>
      )}
    </>
  );
}
export default function App() {
  const [data, setData] = useState<PublicData | null>(null),
    [loadError, setLoadError] = useState("");
  const [config, setConfig] = useState<Config | null>(null),
    [draft, setDraft] = useState({
      start: "1958",
      end: "2025",
      initial: "10000",
      n: "3",
    });
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [log, setLog] = useState(true),
    [rankYear, setRankYear] = useState(2023);
  const [stocks, setStocks] = useState<StockData>(),
    [localName, setLocalName] = useState(""),
    [theme, setTheme] = useState(
      document.documentElement.dataset.theme || "light",
    );
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const version = new URLSearchParams(location.search).get("data");
    if (version && !/^[a-f0-9]{16}$/.test(version)) {
      setLoadError("分享链接中的数据版本格式无效。请移除 data 参数后重试。");
      return;
    }
    fetch(version ? `/data/versions/${version}.json` : "/data/public.json", {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "数据版本不可用；为避免改变结果，未自动替换成其他版本。",
          );
        return r.json();
      })
      .then((d: PublicData) => {
        if (
          d.schemaVersion !== 1 ||
          !d.benchmarks?.sp500 ||
          !d.benchmarks?.nasdaq
        )
          throw new Error("公开数据格式错误");
        setData(d);
        try {
          const c = readConfig(location.search, d.completeThrough);
          setConfig(c);
          setDraft({
            start: String(c.start),
            end: String(c.end),
            initial: String(c.initial),
            n: String(c.n),
          });
        } catch (e) {
          setError((e as Error).message);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(e.message);
      });
    return () => controller.abort();
  }, []);
  const results = useMemo(() => {
    if (!data || !config) return [];
    const ns = Array.from(new Set([1, 3, 5, 10, config.n]));
    return [
      ...ns.map((n) => strategy(stocks, config, n)),
      benchmark("sp500", data, config),
      benchmark("nasdaq", data, config),
    ];
  }, [data, config, stocks]);
  const ranks = useMemo(() => {
    try {
      return rankingFor(stocks, rankYear).slice(0, 10);
    } catch {
      return [];
    }
  }, [stocks, rankYear]);
  const chosen = results.find((r) => r.key === `top${config?.n}`),
    sp = results.find((r) => r.key === "sp500");
  function apply() {
    const c = {
      start: Number(draft.start),
      end: Number(draft.end),
      initial: Number(draft.initial),
      n: Number(draft.n),
    };
    try {
      validateConfig(c);
      setConfig(c);
      setError("");
      history.replaceState(null, "", configSearch(c, data?.version));
      setNotice("参数已更新，链接包含本次数据版本。");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function share() {
    if (!config) return;
    const url =
      location.origin + location.pathname + configSearch(config, data?.version);
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setNotice(
        localName
          ? "链接已复制。链接仅重现公开基准与配置；私有文件不会分享，接收者需自行导入同一文件。"
          : "分享链接已复制，包含配置和固定数据版本。",
      );
    } catch {
      setNotice(`请复制地址栏链接：${url}`);
    }
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20e6) throw new Error("文件不得超过 20 MB。");
      const d: unknown = JSON.parse(await file.text());
      assertStockData(d);
      setStocks(d);
      setLocalName(file.name);
      setNotice(
        "文件已在本浏览器内存中加载，不上传、不公开。刷新后需重新选择。",
      );
    } catch (e) {
      setNotice(`导入失败：${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  function toggleTheme() {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* Storage can be disabled. */
    }
  }
  function exportCSV() {
    if (!config) return;
    const rows = [
      ["year", ...results.flatMap((r) => [r.key + "_return", r.key + "_USD"])],
    ];
    for (let y = config.start; y <= config.end; y++)
      rows.push([
        String(y),
        ...results.flatMap((r) => {
          const a = r.annual.find((a) => a.year === y);
          return [a ? String(a.return) : "", a ? String(a.value) : ""];
        }),
      ]);
    const b = new Blob(
      [
        "\uFEFF" +
          rows.map((r) => r.join(",")).join("\n") +
          "\n\nSource: Aswath Damodaran NYU; Nasdaq Inc. via FRED. Non-commercial educational research only.\nData version: " +
          data?.version,
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "momentum-lab-results.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (loadError)
    return (
      <main className="load">
        <h1>无法加载回测数据</h1>
        <p role="alert">{loadError}</p>
        <a href="/">加载最新公开版本</a>
      </main>
    );
  if (!data)
    return (
      <main className="load" aria-busy="true">
        <h1>历史收益实验室</h1>
        <p>正在加载可追溯的数据快照…</p>
      </main>
    );
  const years = Array.from(
    { length: data.completeThrough - 1958 + 1 },
    (_, i) => 1958 + i,
  );
  const selectedYear = chosen?.annual.find((a) => a.year === rankYear + 1);
  return (
    <>
      <header className="masthead">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            M<span>↗</span>
          </span>
          <span>
            MOMENTUM LAB<small>历史收益实验室</small>
          </span>
        </a>
        <div className="header-actions">
          <a href="#quality">数据说明</a>
          <button onClick={toggleTheme}>
            {theme === "dark" ? "浅色" : "深色"}
          </button>
          <a href={repo} target="_blank" rel="noreferrer">
            源代码 ↗
          </a>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">S&P 500 / ANNUAL ROTATION</p>
            <h1>
              去年的赢家，
              <br />
              能赢得下一年吗？
            </h1>
            <p className="intro-copy">
              用历史检验年度轮换。每年买入上一年涨幅前 N
              名，等权持有，年底换仓并复投。
            </p>
          </div>
          <aside className="data-stamp">
            <span className="live-dot" />
            公开研究数据
            <dl>
              <div>
                <dt>标普年度总回报</dt>
                <dd>1958—{data.completeThrough}</dd>
              </div>
              <div>
                <dt>纳指年度价格回报</dt>
                <dd>
                  1972—
                  {Math.max(...Object.keys(data.benchmarks.nasdaq).map(Number))}
                </dd>
              </div>
              <div>
                <dt>已核验个股排名</dt>
                <dd>{Object.keys(stocks?.rankings || {}).length} 年</dd>
              </div>
            </dl>
          </aside>
        </section>
        <section aria-label="回测配置" className="controls">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <label>
              起始年份
              <select
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <span className="range-dash" aria-hidden="true">
              →
            </span>
            <label>
              结束年份
              <select
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              初始资金 · USD
              <input
                inputMode="decimal"
                type="number"
                min="0.01"
                max="1000000000000"
                step="any"
                value={draft.initial}
                onChange={(e) =>
                  setDraft({ ...draft, initial: e.target.value })
                }
              />
            </label>
            <label>
              年度持仓数
              <select
                value={draft.n}
                onChange={(e) => setDraft({ ...draft, n: e.target.value })}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Top {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="submit">
              运行回测 <span aria-hidden="true">↗</span>
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        <div className="notice" role="status">
          {notice ||
            "当前公开版提供真实指数回测。个股历史总回报尚不完整，Top N 策略不会用推测数据绘图。"}
        </div>
        <section className="chart-section" aria-labelledby="curve-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GROWTH OF CAPITAL</p>
              <h2 id="curve-title">让时间展开收益</h2>
            </div>
            <div className="inline-actions">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={log}
                  onChange={(e) => setLog(e.target.checked)}
                />
                对数坐标
              </label>
              <button onClick={share} disabled={!config}>
                分享配置
              </button>
            </div>
          </div>
          <div className="legend">
            {results.map((r) => (
              <span key={r.key} className={r.error ? "unavailable" : ""}>
                <i style={{ background: colorFor(r.key) }} />
                {r.label}
                {r.error ? " · 缺数据" : ""}
              </span>
            ))}
          </div>
          {config ? (
            <Chart results={results} config={config} log={log} />
          ) : (
            <p>请修正参数并运行回测。</p>
          )}
          <p className="note">
            美元名义收益，未扣税费和通胀。标普包含股息再投资；纳指为价格指数，不含股息。纳指在所选区间与可用数据的交集起点重新投入相同本金，起点不同时不能直接比较终值。回撤仅基于年末净值，非日频最大回撤。
          </p>
        </section>
        <section className="results-section" aria-labelledby="results-title">
          <div className="section-heading">
            <h2 id="results-title">同一规则，逐项对照</h2>
            <button onClick={exportCSV} disabled={!config}>
              导出年度结果 ↓
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                策略与基准的终值、年化回报、年末最大回撤及跑赢标普年份比例
              </caption>
              <thead>
                <tr>
                  <th>策略 / 基准</th>
                  <th>有效区间</th>
                  <th>复利终值</th>
                  <th>CAGR</th>
                  <th>年末最大回撤</th>
                  <th>跑赢标普年份</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const matched = r.annual.filter((a) => {
                    const b = sp?.annual.find((b) => b.year === a.year);
                    return b && a.return > b.return;
                  });
                  return (
                    <tr key={r.key}>
                      <th>
                        <i
                          className="swatch"
                          style={{ background: colorFor(r.key) }}
                        />
                        {r.label}
                      </th>
                      <td>{r.error ? "—" : `${r.start}—${r.end}`}</td>
                      <td>{money(r.final)}</td>
                      <td className="numeric">{pct(r.cagr)}</td>
                      <td>{pct(r.maxDrawdown)}</td>
                      <td>
                        {!r.error && r.key !== "sp500"
                          ? `${matched.length} / ${r.annual.length}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="missing-list">
            {results
              .filter((r) => r.error)
              .map((r) => (
                <p key={r.key}>
                  <strong>{r.label}</strong>
                  <span>{r.error}</span>
                </p>
              ))}
          </div>
        </section>
        <section className="detail-grid">
          <div>
            <div className="section-heading">
              <h2>年度前十与下一年仓位</h2>
              <label className="year-picker">
                排名年
                <select
                  aria-label="查看排名年份"
                  value={rankYear}
                  onChange={(e) => setRankYear(Number(e.target.value))}
                >
                  {[1957, ...years].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>
            {ranks.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>排名</th>
                        <th>证券</th>
                        <th>总回报</th>
                        <th>下一年初权重</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranks.map((r, i) => (
                        <tr key={r.id}>
                          <td>{i + 1}</td>
                          <th>
                            {r.ticker}
                            <small>{r.name}</small>
                          </th>
                          <td>{pct(r.totalReturn)}</td>
                          <td>
                            {i < (config?.n || 0)
                              ? pct(1 / (config?.n || 1))
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedYear && (
                  <p className="note">
                    {rankYear + 1} 年实际持仓：
                    {selectedYear.holdings
                      ?.map(
                        (h) =>
                          `${h.ticker} ${money(h.startValue)} → ${money(h.endValue)}`,
                      )
                      .join("；")}
                  </p>
                )}
              </>
            ) : (
              <div className="empty-state">
                <span className="empty-rule">{rankYear}</span>
                <h3>这一年，先留白。</h3>
                <p>
                  尚缺当年真实成分股母集、完整个股总回报及退市处理。没有足够证据时，不显示冠军、排名或持仓。
                </p>
                {data.rankingEvidence
                  .filter((r) => r.year === rankYear)
                  .map((e) => (
                    <p className="evidence" key={e.ticker}>
                      研究线索：
                      <a href={e.source} target="_blank" rel="noreferrer">
                        S&P 官方文章
                      </a>
                      提及 {e.ticker} 约上涨 {pct(e.returnApprox)}
                      ，仅为七大科技股内的比较，不能证明完整标普前十或总回报排名。
                    </p>
                  ))}
              </div>
            )}
            <div className="local-import">
              <h3>接入你有权使用的历史数据</h3>
              <p>
                文件只在浏览器内存中处理，不发送至服务器。来源与完整母集审核仍需数据提供者负责。
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => importData(e.target.files?.[0])}
                className="sr-only"
                aria-label="选择本机历史数据 JSON"
              />
              <button onClick={() => fileRef.current?.click()}>
                选择本机 JSON
              </button>
              {localName && (
                <>
                  <span className="file-label">已加载：{localName}</span>
                  <button
                    onClick={() => {
                      setStocks(undefined);
                      setLocalName("");
                      setNotice("本机数据已从页面内存移除。");
                    }}
                  >
                    移除
                  </button>
                </>
              )}
              <a href="/data/stock-schema.json" download>
                下载格式说明
              </a>
            </div>
          </div>
          <div>
            <div className="section-heading">
              <h2>逐年表现</h2>
              <span className="note">选中策略 vs. 基准</span>
            </div>
            <div className="table-scroll annual-table">
              <table>
                <thead>
                  <tr>
                    <th>年份</th>
                    <th>Top {config?.n}</th>
                    <th>标普含股息</th>
                    <th>纳指价格</th>
                    <th>超额 · 百分点</th>
                  </tr>
                </thead>
                <tbody>
                  {config &&
                    Array.from(
                      { length: config.end - config.start + 1 },
                      (_, i) => config.end - i,
                    ).map((y) => {
                      const a = chosen?.annual.find((a) => a.year === y),
                        b = sp?.annual.find((a) => a.year === y),
                        n = results
                          .find((r) => r.key === "nasdaq")
                          ?.annual.find((a) => a.year === y);
                      return (
                        <tr key={y}>
                          <th>{y}</th>
                          <td>{pct(a?.return ?? null)}</td>
                          <td>{pct(b?.return ?? null)}</td>
                          <td>{pct(n?.return ?? null)}</td>
                          <td>
                            {a && b
                              ? ((a.return - b.return) * 100).toFixed(2)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section id="quality" className="quality">
          <p className="eyebrow">EVIDENCE BEFORE PERFORMANCE</p>
          <div className="section-heading">
            <h2>数据的边界，也是结果的边界。</h2>
            <span className="version">快照 {data.version}</span>
          </div>
          <div className="quality-summary">
            <p>
              <strong>
                {Object.keys(data.benchmarks.sp500).length} / {years.length}
              </strong>
              标普年度基准
            </p>
            <p>
              <strong>
                {Object.keys(data.benchmarks.nasdaq).length} / {years.length}
              </strong>
              纳指年度基准
            </p>
            <p>
              <strong>
                {Object.keys(stocks?.rankings || {}).length} /{" "}
                {years.length + 1}
              </strong>
              个股排名年（含 1957）
            </p>
          </div>
          <div className="sources">
            <article>
              <h3>标普 500 · 总回报</h3>
              <p>
                Aswath Damodaran / NYU Stern，年度 S&P 500（includes
                dividends）。网页百分比精度为小数点后两位，复算存在舍入误差；并非官方指数点位授权。
              </p>
              <a href={data.sources.nyu.url} target="_blank" rel="noreferrer">
                查看原始来源 ↗
              </a>{" "}
              ·{" "}
              <a
                href={data.sources.nyu.rightsUrl}
                target="_blank"
                rel="noreferrer"
              >
                使用规则
              </a>
            </article>
            <article>
              <h3>纳斯达克综合 · 价格回报</h3>
              <p>
                Nasdaq, Inc., NASDAQ Composite [NASDAQCOM], via
                FRED。前一年最后交易日收盘至当年最后交易日收盘。1971
                年仅有部分年份，完整自然年从 1972 年开始。© Nasdaq OMX Group,
                Inc.，仅用于非商业教育与个人研究。
              </p>
              <a
                href={data.sources.nasdaq.url}
                target="_blank"
                rel="noreferrer"
              >
                查看原始来源 ↗
              </a>{" "}
              ·{" "}
              <a
                href={data.sources.nasdaq.rightsUrl}
                target="_blank"
                rel="noreferrer"
              >
                使用限制
              </a>
            </article>
            <article>
              <h3>历史个股 · 尚未取得完整数据</h3>
              <p>
                优先来源为 CRSP/WRDS
                当时成分、永久证券标识和总回报。需明确处理退市、收购、拆股、分红和现金结算，不可用现有成分股倒推。
              </p>
              <a
                href="https://wrds-www.wharton.upenn.edu/pages/classroom/the-sp-500/"
                target="_blank"
                rel="noreferrer"
              >
                WRDS 历史成分说明 ↗
              </a>
            </article>
          </div>
          <details>
            <summary>计算规则与缺失处理</summary>
            <p>
              排名年 Y 的年末真实标普成分股，以完整自然年总回报排序，Y+1 年按前
              N
              名等权投入。要求排名母集完整、数据来源已复核；缺失任何持仓回报则整个所选区间策略不可计算，不补零、不跳年、不按剩余股票重新分配。相同回报按永久证券标识排序。
            </p>
            <p>
              复投为每年期末资金 ×（1 +
              下一年组合回报），组合年度回报为各持仓总回报的算术平均。清算或收购后的现金年内按零利息持有，不能把退市后的缺失收益擅自视为零。若官方总回报已包括退市结算，不重复叠加。
            </p>
            <p>
              年末信号与年界成交是理想化年度模型，现实中无法在收盘后观察完信号再按同一收盘价成交；未模拟下一交易日开盘差价、交易费、税和滑点。只有年度数据，因此不能报告日频最大回撤。
            </p>
            <p>
              当前年份未结束，故不参与完整年度回测。1958 年策略需额外取得 1957
              年排名。分享链接固定数据版本；本机导入数据不会随链接公开，也不保证他人可取得同一授权文件。
            </p>
          </details>
          <p className="note">
            最近抓取：
            {new Date(data.updatedAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
            })}
            （北京时间）。
            {Object.keys(data.updateWarnings).length > 0
              ? "部分来源更新受限，详见静态 JSON 中的 updateWarnings。"
              : "公开基准快照已生成。"}
            本网站是非商业历史研究工具。
          </p>
        </section>
      </main>
      <footer>
        <span>SP500 MOMENTUM LAB</span>
        <span>只让有依据的数据说话。</span>
        <a href={repo + "/blob/main/docs/CHECKLIST.md"}>项目进度 ↗</a>
      </footer>
    </>
  );
}
