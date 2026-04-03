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
        typeof window.inject_pose_payload === "function" &&
        typeof window.advanceTime === "function",
    );

    await page.click("#btnStart");

    const stateHigh = await page.evaluate(() => {
      const oldRandom = Math.random;
      Math.random = () => 0.5;
      try {
        for (let i = 0; i < 8; i += 1) {
          window.inject_pose_payload(
            { leftHandUp: false, rightHandUp: false, squat: false },
            { pipeline: { healthScore: 95, inferenceStrideFrames: 1, inferenceScale: 1 } },
          );
          window.advanceTime(120);
        }
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = oldRandom;
      }
    });

    const stateLow = await page.evaluate(() => {
      const oldRandom = Math.random;
      Math.random = () => 0.5;
      try {
        for (let i = 0; i < 12; i += 1) {
          window.inject_pose_payload(
            { leftHandUp: false, rightHandUp: false, squat: false },
            { pipeline: { healthScore: 28, inferenceStrideFrames: 3, inferenceScale: 0.7 } },
          );
          window.advanceTime(120);
        }
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = oldRandom;
      }
    });

    assert(stateHigh.runtime?.paceFactor > stateLow.runtime?.paceFactor, "Lower health should reduce pace factor.");
    assert(stateLow.runtime?.paceFactor <= 0.9, "Low health should trigger visible assist pacing.");
    assert(stateLow.runtime?.healthScore <= 35, "Runtime health score should reflect injected low-health payload.");

    console.log("web health adaptive regression passed");
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
  console.error(`web health adaptive regression failed: ${err.message}`);
  process.exit(1);
});
