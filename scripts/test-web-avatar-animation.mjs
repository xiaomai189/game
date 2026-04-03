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
  const server = spawn("python", ["-m", "http.server", String(PORT), "-d", "web"], { stdio: "ignore" });
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
        typeof window.advanceTime === "function" &&
        typeof window.set_visual_preset === "function",
    );

    await page.click("#btnStart");
    await page.evaluate(async () => {
      await window.set_avatar_skin("sakura");
      window.set_visual_preset("sakura-lite");
      window.advanceTime(120);
    });

    const moveState = await page.evaluate(() => {
      window.inject_pose_payload({ leftHandUp: true, rightHandUp: false, squat: false });
      window.advanceTime(140);
      return JSON.parse(window.render_game_to_text());
    });
    assert(moveState.visual?.avatarFrameState === "move_left", "Left pose should trigger move_left avatar frame.");

    const idleState = await page.evaluate(() => {
      window.inject_pose_payload({ leftHandUp: false, rightHandUp: false, squat: false });
      window.advanceTime(260);
      return JSON.parse(window.render_game_to_text());
    });
    assert(idleState.visual?.avatarFrameState === "idle", "Neutral pose should return animation to idle.");

    const neonPreset = await page.evaluate(() => {
      window.set_visual_preset("neon");
      window.advanceTime(60);
      return {
        text: JSON.parse(window.render_game_to_text()),
        preset: document.body.dataset.visualPreset,
      };
    });
    assert(neonPreset.text.visual?.visualPreset === "neon", "render_game_to_text should expose visualPreset=neon.");
    assert(neonPreset.preset === "neon", "Body data-visual-preset should update to neon.");

    const fallbackState = await page.evaluate(async () => {
      await window.set_avatar_skin("prototype");
      window.advanceTime(120);
      return JSON.parse(window.render_game_to_text());
    });
    assert(fallbackState.visual?.avatarRenderPath === "procedural", "Prototype skin should fallback to procedural render.");
    assert(
      typeof fallbackState.visual?.assetFallbackReason === "string" && fallbackState.visual.assetFallbackReason.length > 0,
      "Fallback reason should be exposed for prototype skin.",
    );

    const gameOverState = await page.evaluate(() => {
      window.switch_workout_mode("classic");
      const originalRandom = Math.random;
      Math.random = () => 0.0;
      try {
        window.advanceTime(5000);
        return JSON.parse(window.render_game_to_text());
      } finally {
        Math.random = originalRandom;
      }
    });
    assert(gameOverState.mode === "GAME_OVER", "Collision should still trigger GAME_OVER.");
    assert(
      gameOverState.visual?.avatarFrameState === "miss" || gameOverState.visual?.avatarFrameState === "game_over",
      "Game over phase should expose miss/game_over animation state.",
    );

    console.log("web avatar animation regression passed");
  } finally {
    if (browser) await browser.close();
    if (server && !server.killed) server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(`web avatar animation regression failed: ${err.message}`);
  process.exit(1);
});
