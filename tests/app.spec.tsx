import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import App from "../src/App";
vi.mock("../src/GrowthChart", () => ({
  default: ({results}: {results:{key:string;final:number|null}[]}) => <div role="img" aria-label="Test chart" data-series={JSON.stringify(results.map(r=>({key:r.key,final:r.final})))} />,
  lineColors: { strategy: "green", top3:"purple", custom:"pink", sp500: "blue", nasdaq: "gold" },
  seriesLabel: (r: { key: string; label: string }, lang: string) =>
    r.key === "sp500"
      ? lang === "en"
        ? "S&P 500"
        : "标普 500"
      : r.key === "nasdaq"
        ? "Nasdaq"
        : r.label,
}));
const publicData = JSON.parse(readFileSync("public/data/public.json", "utf8"));
const fixture = () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    ticker: "SYNTH-" + i,
    name: "Synthetic only",
    totalReturn: 1 - i * 0.1,
    source: "synthetic test only",
  }));
  const rank = (y: number, rr: typeof rows) => ({
    status: "reviewed",
    asOf: `${y}-12-31`,
    universe: "year-end-sp500-full-year-total-return",
    source: "synthetic",
    count: rr.length,
    rows: rr,
  });
  return {
    schemaVersion: 1,
    redistribution: "local-only",
    licenseEvidence: "Synthetic tests, not market data",
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
};
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/?start=2001&end=2002&initial=10000&n=1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      input.includes("stocks-base")
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => publicData },
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount() {
  render(<App />);
  await screen.findByRole("combobox", { name: "Top N" });
  return userEvent.setup();
}
test("fixed equal-weight curves and benchmarks without a default custom curve", async () => {
  await mount();
  const legend = document.querySelector(".legend")!;
  expect(legend.textContent).toContain("Top 1");
  expect(legend.textContent).toContain("Top 3");
  expect(legend.textContent).not.toContain("自定义");
  expect(legend.children.length).toBe(4);
  expect(screen.getByRole("table", { name: "按上一年排名设置投资权重" })).toBeTruthy();
  expect(screen.getByRole("table", { name: "年度明细" })).toBeTruthy();
});
test("local file calculates positions and known compounding without network upload", async () => {
  const user = await mount();
  const text = JSON.stringify(fixture());
  const file = new File([text], "synthetic.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => text });
  await user.upload(screen.getByLabelText("选择本机历史数据 JSON"), file);
  await screen.findByText("已加载：synthetic.json");
  expect(document.querySelector(".summary-line")?.textContent).toContain(
    "$30,000.00",
  );
  await user.click(screen.getByRole("button", { name: "展开 2001" }));
  expect(screen.getAllByText("SYNTH-0").length).toBeGreaterThan(0);
  expect(screen.getByText(/2001 \/ 年初金额/)).toBeTruthy();
  expect(
    vi.mocked(fetch).mock.calls.some(([, init]) => init && "body" in init),
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "移除", exact: true }));
  expect(document.querySelector(".summary-line")?.textContent).not.toContain(
    "$30,000.00",
  );
});
test("invalid import never changes active data", async () => {
  const user = await mount();
  const file = new File(["{}"], "bad.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => "{}" });
  await user.upload(screen.getByLabelText("选择本机历史数据 JSON"), file);
  expect(document.querySelector(".status-line")?.textContent).toMatch(/导入失败/);
});
test("custom Top 7 preserves the fixed Top 1 and Top 3 curves", async () => {
  const user = await mount();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Top N" }),
    "7",
  );
  expect(document.querySelector(".legend")?.textContent).not.toContain("Top 7");
  await user.click(screen.getByRole("button",{name:/添加曲线/}));
  expect(document.querySelector(".legend")?.textContent).toContain("Top 7");
  expect(document.querySelector(".legend")?.textContent).toContain("Top 1");
  expect(document.querySelector(".legend")?.textContent).toContain("Top 3");
  expect(document.querySelector(".legend")?.children.length).toBe(5);
  expect(new URLSearchParams(location.search).get("n")).toBe("7");
  expect(new URLSearchParams(location.search).get("data")).toBeNull();
});
test("missing version refuses silent replacement", async () => {
  history.replaceState(null, "", "/?snapshot=1&data=0123456789abcdef");
  vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
  render(<App />);
  await screen.findByRole("heading", { name: "无法加载数据" });
  expect(screen.getByRole("alert").textContent).toMatch(/未替换/);
});
test("switching language translates header controls and details and preserves config", async () => {
  const user = await mount();
  await user.click(screen.getByRole("button", { name: "EN", exact: true }));
  expect(
    screen.getByRole("heading", { name: "Annual Winner Backtest" }),
  ).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Start year" })).toBeTruthy();
  expect(screen.getByText("Sources & methodology")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Run backtest →" })).toBeNull();
  expect(document.documentElement.lang).toBe("en");
  expect(new URLSearchParams(location.search).get("n")).toBe("1");
});
test("default N is one when URL omits it", async () => {
  history.replaceState(null, "", "/?start=2012&end=2022");
  await mount();
  expect(
    (screen.getByRole("combobox", { name: "Top N" }) as HTMLSelectElement)
      .value,
  ).toBe("1");
});
test("share button removed and rank weights are editable", async () => {
  const user = await mount();
  expect(screen.queryByRole("button", {name: /分享/})).toBeNull();
  await user.selectOptions(screen.getByRole("combobox", {name:"Top N"}), "2");
  const first = screen.getByRole("spinbutton", {name:"第1名权重"}) as HTMLInputElement;
  const second = screen.getByRole("spinbutton", {name:"第2名权重"}) as HTMLInputElement;
  expect(first.value).toBe("50");
  expect(second.value).toBe("50");
  await user.clear(first); await user.type(first, "70");
  await user.clear(second); await user.type(second, "30");
  expect(new URLSearchParams(location.search).get("weights")).toBe("0.7,0.3");
  await user.click(screen.getByRole("button", {name:"恢复等权"}));
  expect(first.value).toBe("50");
});

test("default capital is one and edits update immediately", async () => {
  history.replaceState(null, "", "/?start=2001&end=2002");
  const user = await mount();
  const input = screen.getByRole("spinbutton", {name: "初始资金 · USD"}) as HTMLInputElement;
  expect(input.value).toBe("1");
  await user.clear(input);
  await user.type(input, "25");
  expect(new URLSearchParams(location.search).get("initial")).toBe("25");
  expect(screen.queryByRole("button", { name: /运行回测/ })).toBeNull();
});

test("end year includes the current year and discloses unavailable YTD references", async () => {
  const user = await mount();
  const current = String(new Date().getUTCFullYear());
  await user.selectOptions(screen.getByRole("combobox", {name:"结束年份"}),current);
  expect(new URLSearchParams(location.search).get("end")).toBe(current);
  expect(screen.getByText(/本年为 YTD/)).toBeTruthy();
});

test("pinned old stock snapshot has a visible latest-data link", async () => {
  const old = JSON.parse(readFileSync("public/data/base-versions/9bf6ebd73f3563a4.json","utf8"));
  const latest = JSON.parse(readFileSync("public/data/base-latest.json","utf8"));
  history.replaceState(null,"","/?snapshot=1&start=1996&end=2012&base=9bf6ebd73f3563a4");
  vi.mocked(fetch).mockImplementation(async (input) => {
    const path=String(input);
    return {ok:true,json:async()=>path.includes("base-latest")?latest:path.includes("base-versions")?old:publicData} as Response;
  });
  await mount();
  const link=screen.getByRole("link",{name:"加载最新数据 ↗"});
  expect(link.getAttribute("href")).not.toContain("base=");
  expect(link.getAttribute("href")).not.toContain("snapshot=");
  expect(link.getAttribute("href")).toContain("start=1997");
});


test("legacy stock URL loads the latest sample and continues beyond 2010", async () => {
  const base = JSON.parse(readFileSync("public/data/stocks-base.json", "utf8"));
  const ytd = JSON.parse(readFileSync("public/data/stocks-ytd.json", "utf8"));
  history.replaceState(null, "", "/?start=1996&end=2026&initial=1&n=1&weights=1&data=f113947b02cf5930&lang=en&base=9bf6ebd73f3563a4&ytd=1d120d2a706541c1");
  vi.mocked(fetch).mockImplementation(async (input) => {
    const path = String(input);
    return {ok:true,json:async()=>path.endsWith("stocks-base.json")?base:path.endsWith("stocks-ytd.json")?ytd:publicData} as Response;
  });
  await mount();
  expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).includes("base-versions"))).toBe(false);
  expect(new URLSearchParams(location.search).get("base")).toBeNull();
  expect(document.querySelector(".summary-line")?.textContent).toContain("2026");
  expect(document.body.textContent).toContain("2025");
});

test("start-year choices match stock coverage and migrate unsupported older URLs", async () => {
  const base = JSON.parse(readFileSync("public/data/stocks-base.json", "utf8"));
  history.replaceState(null, "", "/?start=1958&end=2025&lang=en");
  vi.mocked(fetch).mockImplementation(async input => ({ok:true,json:async()=>String(input).endsWith("stocks-base.json")?base:publicData}) as Response);
  await mount();
  const select = screen.getByRole("combobox",{name:"Start year"}) as HTMLSelectElement;
  expect(select.options[0].value).toBe("1997");
  expect(select.value).toBe("1997");
  expect(new URLSearchParams(location.search).get("start")).toBe("1997");
});

test("price-only base overrides the legacy sample and rules are separate bullets", async () => {
  const base = {...fixture(),quality:"exploratory",basis:"split_adjusted_price_return",startYear:2000,endYear:2002,version:"0000000000000001"};
  for (const rank of Object.values(base.rankings)) {rank.status="provisional";rank.universe="historical-members-available-sample";}
  vi.mocked(fetch).mockImplementation(async input => ({ok:true,json:async()=>String(input).endsWith("stocks-price.local.json")?base:publicData}) as Response);
  await mount();
  const bullets = document.querySelectorAll(".strategy-rules li");
  expect(bullets.length).toBe(6);
  expect(bullets[2].textContent).toContain("不要求上市满一年");
  expect(bullets[3].textContent).toContain("不计现金分红");
  expect(document.querySelector(".summary-line")?.textContent).toContain("2001");
  expect(screen.queryByText(/当前为旧版或导入数据/)).toBeNull();
});


test("custom weights leave fixed equal-weight results unchanged and each line toggles independently", async () => {
  const user = await mount();
  const text = JSON.stringify(fixture());
  const file = new File([text], "synthetic.json", {type:"application/json"});
  Object.defineProperty(file,"text",{value:async()=>text});
  await user.upload(screen.getByLabelText("选择本机历史数据 JSON"),file);
  await user.selectOptions(screen.getByRole("combobox",{name:"Top N"}),"2");
  const series = () => JSON.parse(screen.getByRole("img").getAttribute("data-series")!) as {key:string;final:number}[];
  await user.click(screen.getByRole("button",{name:/添加曲线/}));
  const before = series();
  const a=screen.getByRole("spinbutton",{name:"第1名权重"}), b=screen.getByRole("spinbutton",{name:"第2名权重"});
  await user.clear(a); await user.type(a,"70");
  await user.clear(b); await user.type(b,"30");
  expect(series().find(r=>r.key==="top1-equal")).toEqual(before.find(r=>r.key==="top1-equal"));
  expect(series().find(r=>r.key==="top3-equal")).toEqual(before.find(r=>r.key==="top3-equal"));
  expect(series().find(r=>r.key==="custom-1")).toEqual(before.find(r=>r.key==="custom-1"));
  await user.click(screen.getByRole("button",{name:/添加曲线/}));
  expect(series().find(r=>r.key==="custom-2")?.final).not.toBe(before.find(r=>r.key==="custom-1")?.final);
  const fixed=screen.getByRole("button",{name:"Top 3 · 等权",exact:true});
  await user.click(fixed);
  expect(series().some(r=>r.key==="top3-equal")).toBe(false);
  expect(series().some(r=>r.key==="custom-1")).toBe(true);
  await user.click(fixed);
  expect(series().some(r=>r.key==="top3-equal")).toBe(true);
});


test("at most five added curves and deleting a hidden curve frees a slot", async () => {
  const user = await mount();
  const add=()=>screen.getByRole("button",{name:/添加曲线/});
  for(let i=0;i<5;i++) await user.click(add());
  expect((add() as HTMLButtonElement).disabled).toBe(true);
  expect(document.querySelector(".legend")?.children.length).toBe(9);
  await user.click(screen.getByRole("button",{name:/^删除 自定义 2/}));
  expect((add() as HTMLButtonElement).disabled).toBe(false);
  expect(document.querySelector(".legend")?.children.length).toBe(8);
  await user.click(add());
  expect(document.querySelector(".legend")?.children.length).toBe(9);
});
