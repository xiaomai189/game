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
        typeof window.set_input_mode === "function" &&
        typeof window.get_transport_state === "function" &&
        typeof window.render_game_to_text === "function",
    );

    await page.evaluate(() => window.set_input_mode("camera"));
    await page.waitForTimeout(6800);

    const transport = await page.evaluate(() => window.get_transport_state());
    assert(transport.connected === false, "Transport should stay disconnected without YOLO backend.");
    assert(transport.retryCount >= 1, "Retry count should increment in camera mode.");
    assert(transport.retryCount <= 3, `Retry count should be throttled (<=3), got ${transport.retryCount}.`);

    const connText = await page.evaluate(() => document.getElementById("conn")?.textContent || "");
    const connLower = connText.toLowerCase();
    assert(
      connLower.includes("retry") || connLower.includes("reconnecting") || connLower.includes("waiting"),
      `Connection banner should expose reconnect state, got: ${connText}`,
    );

    const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(
      textState.transport && typeof textState.transport.retryCount === "number",
      "render_game_to_text should include transport retry diagnostics.",
    );

    console.log("web ws reconnect noise regression passed");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error(`web ws reconnect noise regression failed: ${err.message}`);
  process.exit(1);
});
