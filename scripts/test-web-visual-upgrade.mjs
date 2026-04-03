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
    await sleep(120);
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
        typeof window.inject_pose_payload === "function" &&
        typeof window.advanceTime === "function",
    );

    await page.click("#btnStart");
    const result = await page.evaluate(() => {
      for (let i = 0; i < 8; i += 1) {
        window.inject_pose_payload(
          { leftHandUp: false, rightHandUp: false, squat: false },
          { pipeline: { healthScore: 34, inferenceStrideFrames: 3, inferenceScale: 0.7, trackingQuality: 0.5, calibrationProgress: 1 } },
        );
        window.advanceTime(120);
      }
      const state = JSON.parse(window.render_game_to_text());
      return {
        visual: state.visual,
        runtime: state.runtime,
        status: document.getElementById("gameStatus")?.textContent || "",
      };
    });

    assert(result.visual?.assetTheme === "anime-neon-2.5d", "assetTheme should be anime-neon-2.5d.");
    assert(result.visual?.avatarStyle === "anime-runner", "avatarStyle should be anime-runner.");
    assert(result.visual?.depthProjection === true, "depthProjection should be true.");
    assert(result.visual?.renderMode === "mode-isolated-2.5d", "renderMode should be mode-isolated-2.5d.");
    assert(result.runtime?.paceFactor <= 0.9, "Low health should trigger assist pacing.");
    assert(result.status.includes("Assist"), "HUD status should expose Assist tag under low health.");

    console.log("web visual upgrade regression passed");
  } finally {
    if (browser) await browser.close();
    if (server && !server.killed) server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(`web visual upgrade regression failed: ${err.message}`);
  process.exit(1);
});
