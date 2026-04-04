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

    await page.keyboard.press("Enter");
    let state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(state.mode === "RUNNING", "Enter should start round from READY.");

    await page.keyboard.press("KeyP");
    state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(state.mode === "PAUSED", "P should pause from RUNNING.");

    await page.keyboard.press("KeyP");
    state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(state.mode === "RUNNING", "P should resume from PAUSED.");

    state = await page.evaluate(() => {
      const originalRandom = Math.random;
      Math.random = () => 0.0;
      try {
        window.advanceTime(5000);
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = originalRandom;
      }
    });
    assert(state.mode === "GAME_OVER", "Collision should end the round.");
    assert(state.round?.gameOverReason === "collision", "round.gameOverReason should be collision after miss.");

    const roundHint = await page.evaluate(() => document.getElementById("roundHint")?.textContent || "");
    assert(roundHint.toLowerCase().includes("collision"), "HUD round hint should explain collision ending.");

    await page.keyboard.press("Enter");
    state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(state.mode === "RUNNING", "Enter should restart from GAME_OVER.");

    await page.evaluate(() => window.advanceTime(1200));
    const beforeRestart = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(beforeRestart.mode === "RUNNING", "Round should still be running before R restart.");

    await page.keyboard.press("KeyR");
    const afterRestart = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(afterRestart.mode === "RUNNING", "R should quick-restart into RUNNING.");
    assert(afterRestart.score === 0, "R restart should reset score to 0.");

    const meterSnapshot = await page.evaluate(() => ({
      healthText: document.getElementById("healthMeterText")?.textContent || "",
      paceText: document.getElementById("paceMeterText")?.textContent || "",
      healthWidth: document.getElementById("healthMeterFill")?.style?.width || "",
      paceWidth: document.getElementById("paceMeterFill")?.style?.width || "",
    }));
    assert(meterSnapshot.healthText.includes("/ 100"), "Health meter should render readable text.");
    assert(meterSnapshot.paceText.includes("%"), "Pace meter should render readable percentage.");
    assert(meterSnapshot.healthWidth !== "0%", "Health meter width should be populated.");
    assert(meterSnapshot.paceWidth !== "0%", "Pace meter width should be populated.");

    console.log("web hotkeys and feedback regression passed");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error(`web hotkeys and feedback regression failed: ${err.message}`);
  process.exit(1);
});
