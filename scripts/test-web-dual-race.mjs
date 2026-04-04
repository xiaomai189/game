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

function makeCameraFrame(cameraId, actions) {
  return {
    cameraId,
    connected: true,
    source: `camera:${cameraId}`,
    cameraStatus: "OK",
    cameraStatusReason: "test-ok",
    blackFrameStreak: 0,
    reconnectAttempts: 0,
    actions: {
      leftHandUp: Boolean(actions.leftHandUp),
      rightHandUp: Boolean(actions.rightHandUp),
      bothHandsUp: false,
      squat: false,
      moveLeft: false,
      moveRight: false,
    },
    pipeline: {
      healthScore: 100,
      inferenceStrideFrames: 1,
      inferenceScale: 1,
      trackingQuality: 1,
      calibrationProgress: 1,
    },
  };
}

function laneActions(laneIndex) {
  if (laneIndex === 0) return { leftHandUp: true, rightHandUp: false };
  if (laneIndex === 2) return { leftHandUp: false, rightHandUp: true };
  return { leftHandUp: false, rightHandUp: false };
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
        typeof window.set_game_mode === "function" &&
        typeof window.inject_pose_payload === "function",
    );

    await page.evaluate(() => {
      window.set_input_mode("camera");
      window.set_game_mode("dual_race");
    });
    await page.click("#btnStart");

    await page.evaluate((payload) => {
      window.inject_pose_payload(
        {},
        {
          payload,
          source: "test",
        },
      );
    }, {
      type: "frame",
      cameras: [
        makeCameraFrame(0, { leftHandUp: true, rightHandUp: false }),
        makeCameraFrame(1, { leftHandUp: false, rightHandUp: true }),
      ],
    });

    const first = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(first.workoutMode === "dual_race", "Expected dual_race workout mode.");
    assert(first.players?.p1?.laneLabel === "left", "P1 should map to camera 0 left lane.");
    assert(first.players?.p2?.laneLabel === "right", "P2 should map to camera 1 right lane.");
    assert(first.cameraStatus?.cam0?.cameraStatus === "OK", "Expected cam0 status in render_game_to_text.");
    assert(first.cameraStatus?.cam1?.cameraStatus === "OK", "Expected cam1 status in render_game_to_text.");
    const statusText = await page.textContent("#camera0Status");
    assert((statusText || "").includes("OK"), "Camera status card should show OK.");

    await page.evaluate((payload) => {
      window.advanceTime(120);
      window.inject_pose_payload(
        {},
        {
          payload,
          source: "test",
        },
      );
    }, {
      type: "frame",
      cameras: [
        makeCameraFrame(0, { leftHandUp: false, rightHandUp: true }),
        makeCameraFrame(1, { leftHandUp: true, rightHandUp: false }),
      ],
    });

    const second = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(second.players?.p1?.laneLabel === "right", "P1 lane should update independently.");
    assert(second.players?.p2?.laneLabel === "left", "P2 lane should update independently.");

    await page.evaluate(() => {
      window.advanceTime(700);
    });
    const seeded = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const safeLane = seeded.track?.nextSafeLane;
    assert(Number.isInteger(safeLane), "Expected shared track nextSafeLane.");

    const p1Wrong = (safeLane + 1) % 3;
    const p2Safe = safeLane;
    for (let i = 0; i < 28; i += 1) {
      // Keep feeding lane intent until the first shared obstacle is checked.
      await page.evaluate((payload) => {
        window.inject_pose_payload(
          {},
          {
            payload,
            source: "test",
          },
        );
        window.advanceTime(120);
      }, {
        type: "frame",
        cameras: [
          makeCameraFrame(0, laneActions(p1Wrong)),
          makeCameraFrame(1, laneActions(p2Safe)),
        ],
      });
    }

    const eliminationState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(eliminationState.mode === "RUNNING", "One elimination should not end the round.");
    assert(eliminationState.players?.p1?.alive === false, "P1 should be eliminated on wrong lane.");
    assert(eliminationState.players?.p2?.alive === true, "P2 should continue running.");

    await page.evaluate(() => window.advanceTime(46000));
    const finished = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(finished.mode === "GAME_OVER", "Round should end only by timer.");
    assert(["p1", "p2", "draw"].includes(finished.winner), "Winner should be resolved at round end.");

    console.log("web dual race regression passed");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error(`web dual race regression failed: ${err.message}`);
  process.exit(1);
});
