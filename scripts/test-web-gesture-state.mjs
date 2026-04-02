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

    const evaluateState = async (fn) =>
      JSON.parse(
        await page.evaluate(
          (source) => {
            const action = new Function(source);
            return action();
          },
          `return (${fn})();`,
        ),
      );

    const leftImmediate = await evaluateState(
      "() => window.inject_pose_payload({ leftHandUp: true, rightHandUp: false })",
    );
    assert(leftImmediate.laneLabel === "left", "Left hand should switch lane to left immediately.");

    const reverseBlocked = await evaluateState(
      "() => window.inject_pose_payload({ leftHandUp: false, rightHandUp: true })",
    );
    assert(reverseBlocked.laneLabel === "left", "Reverse input should be blocked inside lock window.");

    const reverseAfterLock = await evaluateState(
      "() => { window.advanceTime(90); return window.inject_pose_payload({ leftHandUp: false, rightHandUp: true }); }",
    );
    assert(reverseAfterLock.laneLabel === "right", "Reverse input should work after lock window.");

    const centerNotReady = await evaluateState(
      "() => { window.inject_pose_payload({ leftHandUp: false, rightHandUp: false }); return window.advanceTime(20); }",
    );
    assert(centerNotReady.laneLabel === "right", "Center commit should not happen before 30ms.");

    const centerCommitted = await evaluateState(
      "() => { window.advanceTime(15); return window.inject_pose_payload({ leftHandUp: false, rightHandUp: false }); }",
    );
    assert(centerCommitted.laneLabel === "middle", "Center commit should happen after about 30ms.");

    const staleFreeze = await evaluateState(
      "() => { window.advanceTime(90); window.inject_pose_payload({ leftHandUp: true, rightHandUp: false }); return window.inject_pose_payload({ leftHandUp: false, rightHandUp: true }, { staleBeforeMs: 500 }); }",
    );
    assert(staleFreeze.laneLabel === "left", "Stale freeze should keep current lane.");
    assert(staleFreeze.control?.intentLane === "hold", "Stale freeze should force intentLane=hold.");

    console.log("web gesture regression passed");
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
  console.error(`web gesture regression failed: ${err.message}`);
  process.exit(1);
});
