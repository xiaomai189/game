import { createClassicMode } from "./modes/classic.js";

const WS_URL = "ws://127.0.0.1:8765";
const INPUT_MODES = new Set(["auto", "camera", "keyboard", "demo"]);
const DEMO_ACTIONS = [
  { leftHandUp: true, rightHandUp: false, squat: false },
  { leftHandUp: false, rightHandUp: true, squat: false },
  { leftHandUp: false, rightHandUp: false, squat: false },
  { leftHandUp: false, rightHandUp: false, squat: true },
];

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
const healthMeterFillEl = document.getElementById("healthMeterFill");
const healthMeterTextEl = document.getElementById("healthMeterText");
const paceMeterFillEl = document.getElementById("paceMeterFill");
const paceMeterTextEl = document.getElementById("paceMeterText");
const roundHintEl = document.getElementById("roundHint");
const diagStreamEl = document.getElementById("diagStream");
const diagLatencyEl = document.getElementById("diagLatency");
const diagActionsEl = document.getElementById("diagActions");
const diagSourceEl = document.getElementById("diagSource");
const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnResume = document.getElementById("btnResume");
const btnRestart = document.getElementById("btnRestart");
const btnDiagToggle = document.getElementById("btnDiagToggle");
const avatarSkinEl = document.getElementById("avatarSkin");
const visualPresetEl = document.getElementById("visualPreset");
const inputModeEl = document.getElementById("inputMode");

const state = {
  connected: false,
  requestedInputMode: "auto",
  effectiveInputMode: "keyboard",
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
  diagCollapsed: true,
  mode: null,
  ws: {
    socket: null,
    retryCount: 0,
    nextRetryAt: 0,
    lastError: "none",
  },
  demo: {
    nextAt: 0,
    index: 0,
  },
};

const manualKeys = { left: false, right: false, down: false };

function normalizeInputMode(mode) {
  return INPUT_MODES.has(mode) ? mode : "auto";
}

function getNow() {
  return state.now || performance.now();
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function setMeter(fillEl, textEl, value, text, riskLevel = "low") {
  const pct = clampPercent(value);
  if (fillEl) {
    fillEl.style.width = `${pct}%`;
    const palette =
      riskLevel === "high"
        ? "linear-gradient(90deg, #ffc6cf, #ff6c9f)"
        : riskLevel === "medium"
          ? "linear-gradient(90deg, #ffe7a8, #ffb979)"
          : "linear-gradient(90deg, #c8ffd8, #86f3dd)";
    fillEl.style.background = palette;
  }
  if (textEl) textEl.textContent = text;
}

function resolveEffectiveInputMode() {
  if (state.requestedInputMode === "demo") return "demo";
  if (state.requestedInputMode === "keyboard") return "keyboard";
  if (state.requestedInputMode === "camera") return "camera";
  return state.connected ? "camera" : "keyboard";
}

function refreshEffectiveInputMode() {
  state.effectiveInputMode = resolveEffectiveInputMode();
}

function sharedState(now = getNow()) {
  return {
    connected: state.connected,
    staleMs: Math.max(0, state.lastPayloadTs === 0 ? 0 : now - state.lastPayloadTs),
    pipeline: { ...state.lastPipeline },
    inputMode: {
      requested: state.requestedInputMode,
      effective: state.effectiveInputMode,
    },
  };
}

function updateConnectionBanner() {
  const mode = state.effectiveInputMode;
  if (mode === "demo") {
    connEl.textContent = "Demo autopilot active";
    connEl.style.color = "#ffe5a0";
    return;
  }
  if (mode === "keyboard") {
    connEl.textContent =
      state.requestedInputMode === "auto"
        ? "Camera offline, keyboard fallback"
        : "Keyboard mode active";
    connEl.style.color = "#ffe5a0";
    return;
  }
  if (state.connected) {
    connEl.textContent = "Pose stream connected";
    connEl.style.color = "#3ce58f";
  } else {
    connEl.textContent = "Pose stream reconnecting...";
    connEl.style.color = "#ffd76e";
  }
}

function setConnectionState(connected) {
  state.connected = connected;
  refreshEffectiveInputMode();
  updateConnectionBanner();
}

function closeSocket() {
  const ws = state.ws.socket;
  if (ws) {
    state.ws.socket = null;
    try {
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.close();
    } catch {
      // ignore close errors
    }
  }
}

function scheduleReconnect(now) {
  const delay = Math.min(10000, 500 * 2 ** Math.max(0, state.ws.retryCount - 1));
  state.ws.nextRetryAt = now + delay;
}

function connectWebSocket(now) {
  const ws = new WebSocket(WS_URL);
  state.ws.socket = ws;
  ws.onopen = () => {
    if (state.ws.socket !== ws) return;
    state.ws.retryCount = 0;
    state.ws.nextRetryAt = 0;
    state.ws.lastError = "none";
    setConnectionState(true);
    updateHud(getNow());
  };
  ws.onclose = () => {
    if (state.ws.socket === ws) state.ws.socket = null;
    if (state.connected) setConnectionState(false);
    state.ws.retryCount += 1;
    scheduleReconnect(getNow());
    updateHud(getNow());
  };
  ws.onerror = () => {
    state.ws.lastError = "connect-failed";
    ws.close();
  };
  ws.onmessage = (event) => {
    if (state.effectiveInputMode !== "camera") return;
    try {
      const payload = JSON.parse(event.data);
      if (payload.type !== "frame") return;
      const frameNow = getNow();
      if (frameNow < state.manualOverrideUntil) return;
      const staleBeforeMs = state.lastPayloadTs === 0 ? 0 : frameNow - state.lastPayloadTs;
      state.lastPayloadSource = payload.source || "camera";
      onPose(payload, frameNow, staleBeforeMs);
      state.lastPayloadTs = frameNow;
      updateHud(frameNow);
    } catch {
      // Ignore malformed packets.
    }
  };
}

function maybeEnsureTransport(now) {
  const status = state.mode?.getStatus?.() ?? "READY";
  if (state.requestedInputMode === "auto" && status !== "RUNNING") {
    closeSocket();
    if (state.connected) setConnectionState(false);
    return;
  }
  const wantsCamera = state.requestedInputMode === "camera" || state.requestedInputMode === "auto";
  if (!wantsCamera) {
    closeSocket();
    if (state.connected) setConnectionState(false);
    return;
  }
  if (state.connected || state.ws.socket) return;
  if (now < state.ws.nextRetryAt) return;
  connectWebSocket(now);
}

function updateControlButtons() {
  const status = state.mode?.getStatus?.() ?? "READY";
  btnStart.disabled = status === "RUNNING" || status === "PAUSED";
  btnPause.disabled = status !== "RUNNING";
  btnResume.disabled = status !== "PAUSED";
  btnRestart.disabled = status === "READY";
}

function applyDiagVisibility() {
  document.body.dataset.diagCollapsed = state.diagCollapsed ? "true" : "false";
  if (btnDiagToggle) {
    btnDiagToggle.textContent = state.diagCollapsed ? "Show Diagnostics" : "Hide Diagnostics";
    btnDiagToggle.setAttribute("aria-expanded", state.diagCollapsed ? "false" : "true");
  }
}

function toggleDiagnostics() {
  state.diagCollapsed = !state.diagCollapsed;
  applyDiagVisibility();
}

function syncInputModeSelect() {
  if (inputModeEl) inputModeEl.value = state.requestedInputMode;
}

function updateHud(now = getNow()) {
  if (!state.mode) return;
  refreshEffectiveInputMode();
  updateConnectionBanner();

  const hud = state.mode.getHud(now, sharedState(now));
  gameStatusEl.textContent = hud.statusText;
  timerEl.textContent = hud.timeText;
  scoreEl.textContent = hud.scoreText;
  hitsEl.textContent = hud.hitsText;
  laneEl.textContent = hud.laneText;

  objectiveEl.textContent = "Objective: avoid pink blocks and pass through the safe lane.";
  legendEl.textContent = `Rule: +1 per pass. Timer loops at 0s. Wrong lane ends the round. Progress ${clampPercent(hud.progressPct).toFixed(0)}%.`;
  const riskLevel = hud.riskLevel || "low";
  setMeter(healthMeterFillEl, healthMeterTextEl, hud.healthScore, `${clampPercent(hud.healthScore).toFixed(0)} / 100`, riskLevel);
  setMeter(paceMeterFillEl, paceMeterTextEl, hud.pacePct, `${clampPercent(hud.pacePct).toFixed(0)}%`, riskLevel);
  if (roundHintEl) roundHintEl.textContent = hud.roundHint || "Round hint: --";

  const stream = sharedState(now);
  diagStreamEl.textContent = `input: ${stream.inputMode.effective} (requested:${stream.inputMode.requested})`;
  diagLatencyEl.textContent =
    stream.inputMode.effective === "camera"
      ? `input age: ${stream.staleMs.toFixed(0)}ms`
      : "input age: n/a";
  diagActionsEl.textContent = `actions: L:${Number(state.lastActions.leftHandUp)} R:${Number(state.lastActions.rightHandUp)} S:${Number(state.lastActions.squat)}`;
  const avatarSkin = state.mode?.getAvatarSkin?.() ?? "n/a";
  const visualPreset = state.mode?.getVisualPreset?.() ?? "n/a";
  diagSourceEl.textContent =
    `source: ${state.lastPayloadSource} health:${state.lastPipeline.healthScore.toFixed(0)} ` +
    `stride:${state.lastPipeline.inferenceStrideFrames.toFixed(0)} scale:${state.lastPipeline.inferenceScale.toFixed(2)} ` +
    `skin:${avatarSkin} preset:${visualPreset}`;
}

function populateAvatarSkins() {
  if (!avatarSkinEl || !state.mode?.getAvailableSkins) return;
  const skins = state.mode.getAvailableSkins();
  avatarSkinEl.innerHTML = "";
  for (const skin of skins) {
    const option = document.createElement("option");
    option.value = skin.id;
    option.textContent = skin.label;
    avatarSkinEl.appendChild(option);
  }
  const active = state.mode?.getAvatarSkin?.();
  if (active) avatarSkinEl.value = active;
}

function populateVisualPresets() {
  if (!visualPresetEl || !state.mode?.getAvailableVisualPresets) return;
  const presets = state.mode.getAvailableVisualPresets();
  visualPresetEl.innerHTML = "";
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    visualPresetEl.appendChild(option);
  }
  const active = state.mode?.getVisualPreset?.();
  if (active) {
    visualPresetEl.value = active;
    document.body.dataset.visualPreset = active;
  }
}

async function setAvatarSkin(skinId) {
  if (!state.mode?.setAvatarSkin) return null;
  const result = await state.mode.setAvatarSkin(skinId);
  if (avatarSkinEl && result?.skinId) avatarSkinEl.value = result.skinId;
  updateHud(getNow());
  return result;
}

function setVisualPreset(presetId) {
  if (!state.mode?.setVisualPreset) return null;
  const result = state.mode.setVisualPreset(presetId);
  const applied = result?.presetId ?? state.mode?.getVisualPreset?.();
  if (visualPresetEl && applied) visualPresetEl.value = applied;
  if (applied) document.body.dataset.visualPreset = applied;
  updateHud(getNow());
  return result;
}

function setInputMode(mode) {
  state.requestedInputMode = normalizeInputMode(mode);
  refreshEffectiveInputMode();
  if (state.requestedInputMode === "keyboard" || state.requestedInputMode === "demo") {
    closeSocket();
    setConnectionState(false);
  } else {
    state.ws.nextRetryAt = 0;
  }
  syncInputModeSelect();
  updateHud(getNow());
  return getInputMode();
}

function getInputMode() {
  refreshEffectiveInputMode();
  return {
    requested: state.requestedInputMode,
    effective: state.effectiveInputMode,
    connected: state.connected,
    lastError: state.ws.lastError,
  };
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

function injectPosePayload(actions = {}, options = {}) {
  const now = getNow();
  const staleBeforeMs = typeof options.staleBeforeMs === "number" ? options.staleBeforeMs : 0;
  const payload = {
    type: "frame",
    actions: resolvePayloadActions(actions),
    pipeline: resolvePipelineMetrics(options.pipeline ?? {}),
  };
  state.lastPayloadSource = options.source || "inject";
  onPose(payload, now, staleBeforeMs);
  state.lastPayloadTs = now;
  updateHud(now);
  return payload;
}

function maybeDriveDemoInput(now) {
  if (state.effectiveInputMode !== "demo") return;
  const status = state.mode?.getStatus?.() ?? "READY";
  if (status !== "RUNNING") return;
  if (now < state.demo.nextAt) return;
  const action = DEMO_ACTIONS[state.demo.index % DEMO_ACTIONS.length];
  state.demo.index += 1;
  state.demo.nextAt = now + 320;
  injectPosePayload(action, {
    source: "demo",
    pipeline: {
      healthScore: 100,
      inferenceStrideFrames: 1,
      inferenceScale: 1,
      trackingQuality: 1,
      calibrationProgress: 1,
    },
  });
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

function getModeStatus() {
  return state.mode?.getStatus?.() ?? "READY";
}

function triggerPrimaryAction() {
  const status = getModeStatus();
  if (status === "READY") {
    startGame();
    return;
  }
  if (status === "PAUSED") {
    resumeGame();
    return;
  }
  if (status === "GAME_OVER") {
    restartGame();
  }
}

function togglePauseResumeByShortcut() {
  const status = getModeStatus();
  if (status === "RUNNING") {
    pauseGame();
    return;
  }
  if (status === "PAUSED") {
    resumeGame();
  }
}

function triggerQuickRestart() {
  const status = getModeStatus();
  if (status === "READY") {
    startGame();
    return;
  }
  restartGame();
}

function tickFrame(now) {
  state.now = now;
  maybeEnsureTransport(now);
  maybeDriveDemoInput(now);
  if (state.mode) {
    state.mode.step(now, sharedState(now));
    state.mode.render(now, sharedState(now));
    updateHud(now);
    updateControlButtons();
  }
}

function renderFrame(now) {
  const frameNow = Math.max(state.now, now);
  tickFrame(frameNow);
  requestAnimationFrame(renderFrame);
}

window.render_game_to_text = () => renderToText(getNow());

window.inject_pose_payload = (actions = {}, options = {}) => {
  injectPosePayload(actions, options);
  return renderToText(getNow());
};

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  let now = Math.max(getNow(), performance.now());
  for (let i = 0; i < steps; i += 1) {
    now += 1000 / 60;
    tickFrame(now);
  }
  return renderToText(now);
};

window.switch_workout_mode = () => {
  startGame();
  return renderToText(getNow());
};
window.set_avatar_skin = async (skinId) => setAvatarSkin(skinId);
window.get_avatar_skins = () => state.mode?.getAvailableSkins?.() ?? [];
window.set_visual_preset = (presetId) => setVisualPreset(presetId);
window.get_visual_presets = () => state.mode?.getAvailableVisualPresets?.() ?? [];
window.set_input_mode = (mode) => setInputMode(mode);
window.get_input_mode = () => getInputMode();

function emitManualPoseFromKeys() {
  const now = getNow();
  const left = manualKeys.left && !manualKeys.right;
  const right = manualKeys.right && !manualKeys.left;
  const squat = manualKeys.down;
  state.manualOverrideUntil = now + (manualKeys.left || manualKeys.right || manualKeys.down ? 280 : 120);
  injectPosePayload({ leftHandUp: left, rightHandUp: right, squat }, { source: "keyboard" });
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
    return;
  }
  await document.exitFullscreen();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    triggerPrimaryAction();
    return;
  }
  if (event.key === "p" || event.key === "P") {
    event.preventDefault();
    togglePauseResumeByShortcut();
    return;
  }
  if (event.key === "r" || event.key === "R") {
    event.preventDefault();
    triggerQuickRestart();
    return;
  }
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
if (btnDiagToggle) btnDiagToggle.addEventListener("click", toggleDiagnostics);
if (avatarSkinEl) {
  avatarSkinEl.addEventListener("change", (event) => {
    const nextSkin = event.target?.value;
    if (nextSkin) void setAvatarSkin(nextSkin);
  });
}
if (visualPresetEl) {
  visualPresetEl.addEventListener("change", (event) => {
    const nextPreset = event.target?.value;
    if (nextPreset) setVisualPreset(nextPreset);
  });
}
if (inputModeEl) {
  inputModeEl.addEventListener("change", (event) => {
    const nextMode = event.target?.value;
    if (nextMode) setInputMode(nextMode);
  });
}

state.mode = createClassicMode({ canvas, ctx, initialNow: getNow() });
populateAvatarSkins();
populateVisualPresets();
syncInputModeSelect();
applyDiagVisibility();
setConnectionState(false);
updateHud(getNow());
updateControlButtons();
requestAnimationFrame(renderFrame);
