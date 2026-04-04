import { request } from "node:http";
import process from "node:process";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const HOST = "127.0.0.1";
const PORT = 8080;
const BASE_URL = `http://${HOST}:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = request(url, { method: "GET" }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on("error", () => resolve(false));
      req.end();
    });
    if (ok) return;
    await sleep(120);
  }
  throw new Error(`Static server not ready within ${timeoutMs}ms: ${url}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const server = await startStaticServer({ host: HOST, port: PORT, rootDir: "web" });
  let browser;
  try {
    await waitForServer(BASE_URL, 7000);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        typeof window.render_game_to_text === "function" &&
        typeof window.set_input_mode === "function" &&
        typeof window.get_input_mode === "function" &&
        typeof window.advanceTime === "function",
    );

    await page.evaluate(() => window.set_input_mode("auto"));
    await page.waitForTimeout(180);
    const autoMode = await page.evaluate(() => window.get_input_mode());
    assert(autoMode.requested === "auto", "Requested mode should be auto.");
    assert(autoMode.effective === "keyboard", "Auto mode should fallback to keyboard when camera is offline.");

    const connText = await page.evaluate(() => document.getElementById("conn")?.textContent || "");
    assert(connText.toLowerCase().includes("fallback"), "Connection banner should mention fallback when camera is offline.");

    await page.evaluate(() => window.set_input_mode("demo"));
    await page.click("#btnStart");
    await page.evaluate(() => window.advanceTime(700));
    const demoState = await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      return {
        inputMode: state.visual?.inputMode,
        laneLabel: state.laneLabel,
      };
    });
    assert(demoState.inputMode === "demo", "render_game_to_text should expose visual.inputMode=demo.");
    assert(["left", "middle", "right"].includes(demoState.laneLabel), "Demo mode should keep lane data valid.");

    console.log("web input mode fallback regression passed");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error(`web input mode fallback regression failed: ${err.message}`);
  process.exit(1);
});
