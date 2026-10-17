import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import App from "../src/App";
const publicData = JSON.parse(readFileSync("public/data/public.json", "utf8"));
const fixture = () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    ticker: "SYNTH-" + i,
    name: "Synthetic test only",
    totalReturn: 1 - i * 0.1,
    source: "synthetic test only",
  }));
  const rank = (year: number, r: typeof rows) => ({
    status: "reviewed",
    asOf: `${year}-12-31`,
    universe: "year-end-sp500-full-year-total-return",
    source: "synthetic test only",
    count: r.length,
    rows: r,
  });
  return {
    schemaVersion: 1,
    redistribution: "local-only",
    licenseEvidence: "synthetic tests, no real stocks",
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
  history.replaceState(null, "", "/?start=2001&end=2002&initial=10000&n=1");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => publicData }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount() {
  render(<App />);
  await screen.findByRole("button", { name: "运行回测" });
  return userEvent.setup();
}
test("real benchmark renders and public missing stocks stay empty", async () => {
  await mount();
  const table = screen.getAllByRole("table")[0];
  expect(within(table).getByText("$6,878")).toBeTruthy();
  expect(within(table).getByText("$5,406")).toBeTruthy();
  expect(
    screen.getAllByText(/2000 年完整历史成分与总回报排名未核验/).length,
  ).toBe(4);
});
test("local File upload computes all strategies, ranks and holdings without sending file", async () => {
  const user = await mount();
  const file = new File([JSON.stringify(fixture())], "synthetic-only.json", {
    type: "application/json",
  });
  // jsdom File lacks Blob.text; use the browser-standard method for this fixture.
  Object.defineProperty(file, "text", {
    value: async () => JSON.stringify(fixture()),
  });
  await user.upload(screen.getByLabelText("选择本机历史数据 JSON"), file);
  await screen.findByText("已加载：synthetic-only.json");
  const table = screen.getAllByRole("table")[0];
  expect(within(table).getByText("$30,000")).toBeTruthy();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "查看排名年份" }),
    "2000",
  );
  expect(screen.getAllByText("SYNTH-0").length).toBeGreaterThan(0);
  expect(screen.getByText(/2001 年实际持仓：SYNTH-0/)).toBeTruthy();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(
        ([input]) => typeof input === "string" && input.startsWith("/data/"),
      ),
  ).toBe(true);
  expect(
    vi.mocked(fetch).mock.calls.some(([, init]) => init && "body" in init),
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "移除" }));
  expect(within(table).queryByText("$30,000")).toBeNull();
});
test("invalid upload is rejected with useful reason", async () => {
  const user = await mount();
  const file = new File(["{}"], "bad.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => "{}" });
  await user.upload(screen.getByLabelText("选择本机历史数据 JSON"), file);
  await screen.findByText(/导入失败/);
  expect(screen.queryByText("已加载：bad.json")).toBeNull();
});
test("changing N includes custom comparison and updates versioned URL", async () => {
  const user = await mount();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "年度持仓数" }),
    "7",
  );
  await user.click(screen.getByRole("button", { name: "运行回测" }));
  expect(screen.getAllByText("Top 7").length).toBeGreaterThan(0);
  const p = new URLSearchParams(location.search);
  expect(p.get("n")).toBe("7");
  expect(p.get("data")).toBe(publicData.version);
});
test("unavailable snapshot errors instead of silently using current data", async () => {
  history.replaceState(null, "", "/?data=0123456789abcdef");
  vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
  render(<App />);
  await screen.findByRole("heading", { name: "无法加载回测数据" });
  expect(screen.getByRole("alert").textContent).toMatch(/未自动替换/);
});
test("share includes settings and data version", async () => {
  const user = await mount();
  await user.click(screen.getByRole("button", { name: "分享配置" }));
  await waitFor(() =>
    expect(location.search).toContain("data=" + publicData.version),
  );
  expect(screen.getByRole("status").textContent).toMatch(
    /分享链接已复制|请复制地址栏/,
  );
});
