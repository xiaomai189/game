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
        typeof window.set_avatar_skin === "function" &&
        typeof window.get_avatar_skins === "function",
    );

    const skins = await page.evaluate(() => window.get_avatar_skins());
    assert(Array.isArray(skins) && skins.length >= 3, "Should expose at least 3 avatar skin options.");

    await page.click("#btnStart");
    await page.evaluate(async () => {
      await window.set_avatar_skin("neon");
      window.advanceTime(150);
    });

    await page.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return state.visual?.avatarSkin === "neon" && state.visual?.avatarRenderPath === "sprite";
    });
    const neonState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(neonState.visual.avatarSkin === "neon", "Skin should switch to neon.");
    assert(neonState.visual.avatarRenderPath === "sprite", "Neon skin should render via sprite.");

    await page.evaluate(async () => {
      await window.set_avatar_skin("prototype");
      window.advanceTime(150);
    });
    const fallbackState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(fallbackState.visual.avatarSkin === "prototype", "Skin should switch to prototype.");
    assert(fallbackState.visual.avatarRenderPath === "procedural", "Prototype should fallback to procedural render.");
    assert(
      fallbackState.visual.assetFallbackReason === "skin-without-sprites" || fallbackState.visual.assetFallbackReason === "sprite-not-ready",
      "Fallback reason should be reported for prototype skin.",
    );

    console.log("web avatar skins regression passed");
  } finally {
    if (browser) await browser.close();
    if (server && !server.killed) server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(`web avatar skins regression failed: ${err.message}`);
  process.exit(1);
});
