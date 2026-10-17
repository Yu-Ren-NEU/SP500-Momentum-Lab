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
  default: () => <div role="img" aria-label="Test chart" />,
  lineColors: { strategy: "green", sp500: "blue", nasdaq: "gold" },
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
  await screen.findByRole("button", { name: /运行回测/ });
  return userEvent.setup();
}
test("only selected strategy plus two benchmarks; no forced Top 3/5/10", async () => {
  await mount();
  const legend = document.querySelector(".legend")!;
  expect(legend.textContent).toContain("Top 1");
  expect(legend.textContent).not.toMatch(/Top (3|5|10)/);
  expect(legend.children.length).toBe(3);
  expect(screen.getAllByRole("table").length).toBe(1);
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
  expect(screen.getByRole("status").textContent).toMatch(/导入失败/);
});
test("Top 7 replaces Top 1 rather than adding more curves", async () => {
  const user = await mount();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Top N" }),
    "7",
  );
  await user.click(screen.getByRole("button", { name: /运行回测/ }));
  expect(document.querySelector(".legend")?.textContent).toContain("Top 7");
  expect(document.querySelector(".legend")?.textContent).not.toContain("Top 1");
  expect(new URLSearchParams(location.search).get("n")).toBe("7");
  expect(new URLSearchParams(location.search).get("data")).toBe(
    publicData.version,
  );
});
test("missing version refuses silent replacement", async () => {
  history.replaceState(null, "", "/?data=0123456789abcdef");
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
  expect(screen.getByRole("button", { name: "Run backtest →" })).toBeTruthy();
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
test("sharing preserves language and financial snapshot", async () => {
  const user = await mount();
  await user.click(screen.getByRole("button", { name: "EN", exact: true }));
  await user.click(screen.getByRole("button", { name: "Share ↗" }));
  await waitFor(() =>
    expect(location.search).toContain("data=" + publicData.version),
  );
  expect(location.search).toContain("lang=en");
});
