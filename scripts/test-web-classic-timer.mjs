import { spawn } from "node:child_process";
import { request } from "node:http";
import process from "node:process";
import { chromium } from "playwright";

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
    await sleep(150);
  }
  throw new Error(`Static server not ready within ${timeoutMs}ms: ${url}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const server = spawn(
    "python",
    ["-m", "http.server", String(PORT), "-d", "web"],
    { stdio: "ignore" },
  );

  let browser;
  try {
    await waitForServer(BASE_URL, 7000);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        typeof window.render_game_to_text === "function" &&
        typeof window.advanceTime === "function",
    );

    await page.click("#btnStart");

    const timerLoopState = await page.evaluate(() => {
      const originalRandom = Math.random;
      Math.random = () => 0.5; // always middle safe lane, avoids random collision during timer check
      try {
        window.advanceTime(46000);
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = originalRandom;
      }
    });

    assert(timerLoopState.mode === "RUNNING", "Game should keep RUNNING after timer reaches zero.");
    assert(
      timerLoopState.timeLeftSec > 0 && timerLoopState.timeLeftSec <= 45,
      "Timer should wrap into the next cycle instead of ending the game.",
    );

    await page.click("#btnRestart");
    const collisionState = await page.evaluate(() => {
      const originalRandom = Math.random;
      Math.random = () => 0.0; // always left safe lane, default player lane is middle -> must collide
      try {
        window.advanceTime(5000);
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = originalRandom;
      }
    });
    assert(collisionState.mode === "GAME_OVER", "Collision should still trigger GAME_OVER.");

    console.log("web classic timer regression passed");
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server && !server.killed) {
      server.kill("SIGTERM");
    }
  }
}

run().catch((err) => {
  console.error(`web classic timer regression failed: ${err.message}`);
  process.exit(1);
});
