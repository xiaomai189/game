import { createClassicMode } from "./modes/classic.js";

const WS_URL = "ws://127.0.0.1:8765";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const connEl = document.getElementById("conn");
const gameStatusEl = document.getElementById("gameStatus");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const hitsEl = document.getElementById("hits");
const laneEl = document.getElementById("lane");
const objectiveEl = document.getElementById("objective");
const legendEl = document.getElementById("legend");
const diagStreamEl = document.getElementById("diagStream");
const diagLatencyEl = document.getElementById("diagLatency");
const diagActionsEl = document.getElementById("diagActions");
const diagSourceEl = document.getElementById("diagSource");
const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnResume = document.getElementById("btnResume");
const btnRestart = document.getElementById("btnRestart");

const state = {
  connected: false,
  lastPayloadTs: 0,
  lastPayloadSource: "none",
  lastActions: { leftHandUp: false, rightHandUp: false, squat: false },
  lastPipeline: {
    healthScore: 100,
    inferenceStrideFrames: 1,
    inferenceScale: 1,
    trackingQuality: 1,
    calibrationProgress: 1,
  },
  now: performance.now(),
  manualOverrideUntil: 0,
  mode: null,
};

const manualKeys = { left: false, right: false, down: false };

function getNow() {
  return state.now || performance.now();
}

function sharedState(now = getNow()) {
  return {
    connected: state.connected,
    staleMs: Math.max(0, state.lastPayloadTs === 0 ? 0 : now - state.lastPayloadTs),
    pipeline: { ...state.lastPipeline },
  };
}

function setConnectionState(connected) {
  state.connected = connected;
  if (connected) {
    connEl.textContent = "已连接姿态服务";
    connEl.style.color = "#3ce58f";
  } else {
    connEl.textContent = "连接断开，正在重连…";
    connEl.style.color = "#ffd76e";
  }
}

function updateControlButtons() {
  const status = state.mode?.getStatus?.() ?? "READY";
  btnStart.disabled = status === "RUNNING" || status === "PAUSED";
  btnPause.disabled = status !== "RUNNING";
  btnResume.disabled = status !== "PAUSED";
  btnRestart.disabled = status === "READY";
}

function updateHud(now = getNow()) {
  if (!state.mode) return;
  const hud = state.mode.getHud(now, sharedState(now));
  gameStatusEl.textContent = hud.statusText;
  timerEl.textContent = hud.timeText;
  scoreEl.textContent = hud.scoreText;
  hitsEl.textContent = hud.hitsText;
  laneEl.textContent = hud.laneText;

  objectiveEl.textContent = "目标: 躲开红色障碍，穿过蓝色安全道。";
  legendEl.textContent = "规则: 每通过一个障碍 +1；Time 到 0 自动续时；撞到错误通道结束。";

  const stream = sharedState(now);
  diagStreamEl.textContent = `stream: ${stream.connected ? "connected" : "disconnected"}`;
  diagLatencyEl.textContent = `input age: ${stream.staleMs.toFixed(0)}ms`;
  diagActionsEl.textContent = `actions: L:${Number(state.lastActions.leftHandUp)} R:${Number(state.lastActions.rightHandUp)} S:${Number(state.lastActions.squat)}`;
  diagSourceEl.textContent = `source: ${state.lastPayloadSource} health:${state.lastPipeline.healthScore.toFixed(0)} stride:${state.lastPipeline.inferenceStrideFrames.toFixed(0)} scale:${state.lastPipeline.inferenceScale.toFixed(2)}`;
}

function resolvePayloadActions(actions = {}) {
  return {
    leftHandUp: Boolean(actions.leftHandUp),
    rightHandUp: Boolean(actions.rightHandUp),
    squat: Boolean(actions.squat),
  };
}

function resolvePipelineMetrics(pipeline = {}) {
  const toNumberOr = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  return {
    healthScore: toNumberOr(pipeline.healthScore, state.lastPipeline.healthScore),
    inferenceStrideFrames: toNumberOr(pipeline.inferenceStrideFrames, state.lastPipeline.inferenceStrideFrames),
    inferenceScale: toNumberOr(pipeline.inferenceScale, state.lastPipeline.inferenceScale),
    trackingQuality: toNumberOr(pipeline.trackingQuality, state.lastPipeline.trackingQuality),
    calibrationProgress: toNumberOr(pipeline.calibrationProgress, state.lastPipeline.calibrationProgress),
  };
}

function onPose(payload, now, staleBeforeMs = 0) {
  state.lastActions = resolvePayloadActions(payload.actions ?? {});
  state.lastPipeline = resolvePipelineMetrics(payload.pipeline ?? {});
  state.mode?.onPose(payload, now, staleBeforeMs);
}

function renderToText(now = getNow()) {
  if (!state.mode) return "{}";
  return state.mode.renderToText(now, sharedState(now));
}

function startGame() {
  if (!state.mode) return;
  const now = getNow();
  state.mode.start(now);
  updateControlButtons();
  updateHud(now);
}

function pauseGame() {
  if (!state.mode) return;
  state.mode.pause(getNow());
  updateControlButtons();
  updateHud(getNow());
}

function resumeGame() {
  if (!state.mode) return;
  const now = getNow();
  state.mode.resume(now);
  updateControlButtons();
  updateHud(now);
}

function restartGame() {
  if (!state.mode) return;
  const now = getNow();
  state.mode.restart(now);
  updateControlButtons();
  updateHud(now);
}

function connect() {
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => setConnectionState(true);
  ws.onclose = () => {
    setConnectionState(false);
    setTimeout(connect, 1000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type !== "frame") return;
      const now = getNow();
      if (now < state.manualOverrideUntil) return;
      const staleBeforeMs = state.lastPayloadTs === 0 ? 0 : now - state.lastPayloadTs;
      state.lastPayloadSource = payload.source || "ws";
      onPose(payload, now, staleBeforeMs);
      state.lastPayloadTs = now;
      updateHud(now);
    } catch {
      // Ignore malformed packets.
    }
  };
}

function renderFrame(now) {
  const frameNow = Math.max(state.now, now);
  state.now = frameNow;
  if (state.mode) {
    state.mode.step(frameNow, sharedState(frameNow));
    state.mode.render(frameNow, sharedState(frameNow));
    updateHud(frameNow);
    updateControlButtons();
  }
  requestAnimationFrame(renderFrame);
}

window.render_game_to_text = () => renderToText(getNow());

window.inject_pose_payload = (actions = {}, options = {}) => {
  const now = getNow();
  const staleBeforeMs = typeof options.staleBeforeMs === "number" ? options.staleBeforeMs : 0;
  const payload = {
    type: "frame",
    actions: resolvePayloadActions(actions),
    pipeline: resolvePipelineMetrics(options.pipeline ?? {}),
  };
  state.lastPayloadSource = "inject";
  onPose(payload, now, staleBeforeMs);
  state.lastPayloadTs = now;
  updateHud(now);
  return renderToText(now);
};

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  let now = Math.max(getNow(), performance.now());
  for (let i = 0; i < steps; i += 1) {
    now += 1000 / 60;
    state.now = now;
    if (state.mode) {
      state.mode.step(now, sharedState(now));
      state.mode.render(now, sharedState(now));
    }
  }
  updateHud(now);
  updateControlButtons();
  return renderToText(now);
};

window.switch_workout_mode = () => {
  // Keep backward compatibility: any requested mode maps to classic-only build.
  startGame();
  return renderToText(getNow());
};

function emitManualPoseFromKeys() {
  const now = getNow();
  const left = manualKeys.left && !manualKeys.right;
  const right = manualKeys.right && !manualKeys.left;
  const squat = manualKeys.down;
  state.manualOverrideUntil = now + (manualKeys.left || manualKeys.right || manualKeys.down ? 280 : 120);
  window.inject_pose_payload({ leftHandUp: left, rightHandUp: right, squat });
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
    return;
  }
  await document.exitFullscreen();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    manualKeys.left = true;
    emitManualPoseFromKeys();
    return;
  }
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    manualKeys.right = true;
    emitManualPoseFromKeys();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
    manualKeys.down = true;
    emitManualPoseFromKeys();
    return;
  }
  if (event.key === "0") window.switch_workout_mode("classic");
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    manualKeys.left = false;
    emitManualPoseFromKeys();
    return;
  }
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    manualKeys.right = false;
    emitManualPoseFromKeys();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
    manualKeys.down = false;
    emitManualPoseFromKeys();
  }
});

btnStart.addEventListener("click", startGame);
btnPause.addEventListener("click", pauseGame);
btnResume.addEventListener("click", resumeGame);
btnRestart.addEventListener("click", restartGame);

state.mode = createClassicMode({ canvas, ctx, initialNow: getNow() });
setConnectionState(false);
connect();
updateHud(getNow());
updateControlButtons();
requestAnimationFrame(renderFrame);
