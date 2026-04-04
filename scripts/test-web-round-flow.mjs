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
        typeof window.advanceTime === "function",
    );

    await page.evaluate(() => window.set_input_mode("keyboard"));

    const initialButtons = await page.evaluate(() => ({
      startDisabled: document.getElementById("btnStart")?.disabled,
      pauseDisabled: document.getElementById("btnPause")?.disabled,
      resumeDisabled: document.getElementById("btnResume")?.disabled,
      restartDisabled: document.getElementById("btnRestart")?.disabled,
    }));
    assert(initialButtons.startDisabled === false, "Start should be enabled in READY.");
    assert(initialButtons.pauseDisabled === true, "Pause should be disabled in READY.");
    assert(initialButtons.resumeDisabled === true, "Resume should be disabled in READY.");

    await page.click("#btnStart");
    const runningState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(runningState.mode === "RUNNING", "Start should enter RUNNING.");

    await page.click("#btnPause");
    const pausedState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(pausedState.mode === "PAUSED", "Pause should enter PAUSED.");

    await page.click("#btnResume");
    const resumedState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(resumedState.mode === "RUNNING", "Resume should return RUNNING.");

    const gameOverState = await page.evaluate(() => {
      const originalRandom = Math.random;
      Math.random = () => 0.0;
      try {
        window.advanceTime(5000);
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = originalRandom;
      }
    });
    assert(gameOverState.mode === "GAME_OVER", "Collision should reach GAME_OVER.");

    await page.click("#btnRestart");
    const restartedState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(restartedState.mode === "RUNNING", "Restart should immediately re-enter RUNNING.");

    const toggleState = await page.evaluate(() => {
      const btn = document.getElementById("btnDiagToggle");
      const before = btn?.getAttribute("aria-expanded");
      btn?.click();
      const after = btn?.getAttribute("aria-expanded");
      return { before, after };
    });
    assert(toggleState.before !== toggleState.after, "Diagnostics toggle should flip aria-expanded.");

    console.log("web round flow regression passed");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error(`web round flow regression failed: ${err.message}`);
  process.exit(1);
});
