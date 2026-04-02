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

async function waitForServer(url, timeoutMs = 7000) {
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
        typeof window.switch_workout_mode === "function",
    );

    const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    // Sprint lane should be switchable and expose interval fields.
    let s = await page.evaluate(() => window.switch_workout_mode("sprint_lane"));
    s = JSON.parse(s);
    assert(s.workoutMode === "sprint_lane", "Expected sprint_lane mode after switch.");
    assert(s.hp === 3, "Workout mode should start with HP=3.");
    assert(["sprint", "recover"].includes(s.training?.intervalPhase), "Interval phase missing in sprint mode.");

    // Squat gate should reward squat inputs and allow HP-based misses.
    await page.evaluate(() => window.switch_workout_mode("squat_gate"));
    for (let i = 0; i < 80; i += 1) {
      await page.evaluate(() => {
        window.inject_pose_payload({ squat: true });
        window.advanceTime(400);
      });
    }
    s = await state();
    assert(s.workoutMode === "squat_gate", "Expected squat_gate mode.");
    assert(s.score > 0, "Squat gate should produce score with repeated squat inputs.");

    await page.evaluate(() => window.switch_workout_mode("squat_gate"));
    for (let i = 0; i < 80; i += 1) {
      await page.evaluate(() => {
        window.inject_pose_payload({ leftHandUp: false, rightHandUp: false, squat: false });
        window.advanceTime(400);
      });
      s = await state();
      if (s.hp < s.maxHp) break;
    }
    s = await state();
    assert(s.hp < s.maxHp, "Squat gate miss should reduce HP.");

    // Reaction mode should issue targets and reward matched response.
    await page.evaluate(() => window.switch_workout_mode("reaction_drill"));
    for (let i = 0; i < 80; i += 1) {
      s = await state();
      if (s.training?.reactionTarget) break;
      await page.evaluate(() => window.advanceTime(80));
    }
    s = await state();
    assert(Boolean(s.training?.reactionTarget), "Reaction mode should issue a target.");

    const target = s.training.reactionTarget;
    await page.evaluate((t) => {
      if (t === "leftHandUp") window.inject_pose_payload({ leftHandUp: true });
      else if (t === "rightHandUp") window.inject_pose_payload({ rightHandUp: true });
      else if (t === "squat") window.inject_pose_payload({ squat: true });
      else window.inject_pose_payload({ leftHandUp: false, rightHandUp: false, squat: false });
      window.advanceTime(50);
    }, target);

    s = await state();
    assert(s.stats?.actionsCorrect >= 1, "Reaction mode should count matched response as correct.");

    // Default mode should remain classic to avoid breaking old game flow.
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    s = await state();
    assert(s.workoutMode === "classic", "Default mode must remain classic.");

    console.log("web workout mode regression passed");
  } finally {
    if (browser) await browser.close();
    if (server && !server.killed) server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(`web workout mode regression failed: ${err.message}`);
  process.exit(1);
});
