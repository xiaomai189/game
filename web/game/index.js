import { createClassicMode } from "./modes/classic.js";
import { createDualRaceMode } from "./modes/dual_race.js";

const WS_URL = "ws://127.0.0.1:8765";
const INPUT_MODES = new Set(["auto", "camera", "keyboard", "demo"]);
const GAME_MODES = new Set(["auto", "classic", "dual_race"]);
const WS_RETRY_BASE_MS = 1500;
const WS_RETRY_MAX_MS = 30000;
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
const gameModeEl = document.getElementById("gameMode");
const cameraCard0El = document.getElementById("cameraCard0");
const cameraCard1El = document.getElementById("cameraCard1");
const camera0StatusEl = document.getElementById("camera0Status");
const camera1StatusEl = document.getElementById("camera1Status");
const camera0ReasonEl = document.getElementById("camera0Reason");
const camera1ReasonEl = document.getElementById("camera1Reason");
const camera0ReconnectEl = document.getElementById("camera0Reconnect");
const camera1ReconnectEl = document.getElementById("camera1Reconnect");

const state = {
  connected: false,
  requestedInputMode: "auto",
  effectiveInputMode: "keyboard",
  requestedGameMode: "auto",
  effectiveGameMode: "classic",
  lastPayloadTs: 0,
  lastPayloadSource: "none",
  lastPayloadFrame: null,
  lastActions: { leftHandUp: false, rightHandUp: false, squat: false },
  lastPipeline: {
    healthScore: 100,
    inferenceStrideFrames: 1,
    inferenceScale: 1,
    trackingQuality: 1,
    calibrationProgress: 1,
  },
  lastRuntime: {
    dualRequested: false,
    dualReady: false,
    selfCheckStatus: "disabled",
    reason: "init",
    degradedCameraIds: [],
    maxInputAgeMs: 1200,
  },
  cameraRuntimeById: {
    0: {
      connected: false,
      cameraStatus: "UNKNOWN",
      cameraStatusReason: "waiting payload",
      blackFrameStreak: 0,
      reconnectAttempts: 0,
    },
    1: {
      connected: false,
      cameraStatus: "UNKNOWN",
      cameraStatusReason: "waiting payload",
      blackFrameStreak: 0,
      reconnectAttempts: 0,
    },
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

function normalizeGameMode(mode) {
  return GAME_MODES.has(mode) ? mode : "auto";
}

function getNow() {
  return state.now || performance.now();
}

function hasDualCameraPayload(payload) {
  const runtime = payload?.runtime;
  if (runtime && runtime.dualRequested && runtime.dualReady !== true) {
    return false;
  }
  const cameras = Array.isArray(payload?.cameras) ? payload.cameras : [];
  const ids = new Set(
    cameras
      .filter((item) => item && item.connected !== false)
      .map((item) => Number(item?.cameraId))
      .filter((id) => Number.isFinite(id)),
  );
  return ids.has(0) && ids.has(1);
}

function resolveEffectiveGameMode(payload = null) {
  if (state.requestedGameMode === "classic") return "classic";
  if (state.requestedGameMode === "dual_race") return "dual_race";
  return hasDualCameraPayload(payload ?? state.lastPayloadFrame) ? "dual_race" : "classic";
}

function createModeByKind(kind) {
  if (kind === "dual_race") return createDualRaceMode({ canvas, ctx, initialNow: getNow() });
  return createClassicMode({ canvas, ctx, initialNow: getNow() });
}

function syncGameModeSelect() {
  if (gameModeEl) gameModeEl.value = state.requestedGameMode;
}

function switchMode(nextKind) {
  if (state.effectiveGameMode === nextKind && state.mode) return;
  const now = getNow();
  const prevStatus = state.mode?.getStatus?.() ?? "READY";
  state.mode?.dispose?.();
  state.mode = createModeByKind(nextKind);
  state.effectiveGameMode = nextKind;
  populateAvatarSkins();
  populateVisualPresets();
  if (prevStatus === "RUNNING") state.mode.start(now);
  updateControlButtons();
  updateHud(now);
}

function refreshEffectiveGameMode(payload = null) {
  switchMode(resolveEffectiveGameMode(payload));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeCameraStatus(value) {
  const raw = String(value || "UNKNOWN").trim().toUpperCase();
  if (["OK", "WARMUP", "BLACK", "RECONNECTING", "OFFLINE", "UNKNOWN"].includes(raw)) return raw;
  return "UNKNOWN";
}

function normalizeCameraRuntime(camera = {}) {
  const status = normalizeCameraStatus(camera?.cameraStatus);
  const reconnectAttempts = Number.isFinite(Number(camera?.reconnectAttempts))
    ? Number(camera.reconnectAttempts)
    : 0;
  const blackFrameStreak = Number.isFinite(Number(camera?.blackFrameStreak))
    ? Number(camera.blackFrameStreak)
    : 0;
  const connected = Boolean(camera?.connected);
  const reasonRaw = camera?.cameraStatusReason;
  const reason = typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : connected ? "ok" : "camera offline";
  return {
    connected,
    cameraStatus: status,
    cameraStatusReason: reason,
    blackFrameStreak: Math.max(0, Math.round(blackFrameStreak)),
    reconnectAttempts: Math.max(0, Math.round(reconnectAttempts)),
  };
}

function updateCameraHealthCard(cameraId, runtime) {
  const cardEl = cameraId === 0 ? cameraCard0El : cameraCard1El;
  const statusEl = cameraId === 0 ? camera0StatusEl : camera1StatusEl;
  const reasonEl = cameraId === 0 ? camera0ReasonEl : camera1ReasonEl;
  const reconnectEl = cameraId === 0 ? camera0ReconnectEl : camera1ReconnectEl;
  if (!cardEl || !statusEl || !reasonEl || !reconnectEl) return;
  const runtimeSafe = normalizeCameraRuntime(runtime);
  cardEl.dataset.status = runtimeSafe.cameraStatus.toLowerCase();
  statusEl.textContent = `status: ${runtimeSafe.cameraStatus} (${runtimeSafe.connected ? "online" : "offline"})`;
  reasonEl.textContent = `reason: ${runtimeSafe.cameraStatusReason}`;
  reconnectEl.textContent = `reconnects: ${runtimeSafe.reconnectAttempts} | black streak: ${runtimeSafe.blackFrameStreak}`;
}

function updateCameraHealthCards() {
  updateCameraHealthCard(0, state.cameraRuntimeById?.[0] ?? {});
  updateCameraHealthCard(1, state.cameraRuntimeById?.[1] ?? {});
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
    gameMode: {
      requested: state.requestedGameMode,
      effective: state.effectiveGameMode,
    },
  };
}

function resetRetryState() {
  state.ws.retryCount = 0;
  state.ws.nextRetryAt = 0;
  state.ws.lastError = "none";
}

function getTransportSnapshot(now = getNow()) {
  const ws = state.ws.socket;
  const retryInMs = Math.max(0, state.ws.nextRetryAt - now);
  const readyState = ws ? ws.readyState : -1;
  const readyStateLabel =
    readyState === WebSocket.CONNECTING
      ? "CONNECTING"
      : readyState === WebSocket.OPEN
        ? "OPEN"
        : readyState === WebSocket.CLOSING
          ? "CLOSING"
          : readyState === WebSocket.CLOSED
            ? "CLOSED"
            : "NONE";
  return {
    connected: state.connected,
    retryCount: state.ws.retryCount,
    retryInMs,
    nextRetryAt: state.ws.nextRetryAt,
    socketState: readyStateLabel,
    lastError: state.ws.lastError,
  };
}

function updateConnectionBanner(now = getNow()) {
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
    const transport = getTransportSnapshot(now);
    const attempt = Math.max(1, transport.retryCount);
    if (transport.retryInMs > 0) {
      connEl.textContent = `Pose stream offline, retry in ${(transport.retryInMs / 1000).toFixed(1)}s (attempt ${attempt})`;
    } else if (transport.retryCount > 0) {
      connEl.textContent = `Pose stream reconnecting... (attempt ${attempt})`;
    } else {
      connEl.textContent = "Waiting for pose stream...";
    }
    connEl.style.color = "#ffd76e";
  }
}

function setConnectionState(connected) {
  state.connected = connected;
  if (!connected && state.effectiveInputMode !== "demo") {
    state.cameraRuntimeById = {
      0: normalizeCameraRuntime({ connected: false, cameraStatus: "OFFLINE", cameraStatusReason: "ws disconnected" }),
      1: normalizeCameraRuntime({ connected: false, cameraStatus: "OFFLINE", cameraStatusReason: "ws disconnected" }),
    };
  }
  refreshEffectiveInputMode();
  updateConnectionBanner(getNow());
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
  const delay = Math.min(WS_RETRY_MAX_MS, WS_RETRY_BASE_MS * 2 ** Math.max(0, state.ws.retryCount - 1));
  state.ws.nextRetryAt = now + delay;
}

function connectWebSocket(now) {
  const ws = new WebSocket(WS_URL);
  state.ws.socket = ws;
  ws.onopen = () => {
    if (state.ws.socket !== ws) return;
    resetRetryState();
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
      state.lastPayloadFrame = payload;
      refreshEffectiveGameMode(payload);
      onPose(payload, frameNow, staleBeforeMs);
      state.lastPayloadTs = frameNow;
      updateHud(frameNow);
    } catch {
      // Ignore malformed packets.
    }
  };
}

function maybeEnsureTransport(now) {
  const wantsCamera = state.requestedInputMode === "camera" || state.requestedInputMode === "auto";
  if (!wantsCamera) {
    closeSocket();
    resetRetryState();
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
  updateConnectionBanner(now);

  const hud = state.mode.getHud(now, sharedState(now));
  gameStatusEl.textContent = hud.statusText;
  timerEl.textContent = hud.timeText;
  scoreEl.textContent = hud.scoreText;
  hitsEl.textContent = hud.hitsText;
  laneEl.textContent = hud.laneText;

  objectiveEl.textContent =
    hud.objectiveText || "Objective: avoid pink blocks and pass through the safe lane.";
  legendEl.textContent =
    hud.legendText ||
    `Rule: +1 per pass. Timer loops at 0s. Wrong lane ends the round. Progress ${clampPercent(hud.progressPct).toFixed(0)}%.`;
  const riskLevel = hud.riskLevel || "low";
  setMeter(healthMeterFillEl, healthMeterTextEl, hud.healthScore, `${clampPercent(hud.healthScore).toFixed(0)} / 100`, riskLevel);
  setMeter(paceMeterFillEl, paceMeterTextEl, hud.pacePct, `${clampPercent(hud.pacePct).toFixed(0)}%`, riskLevel);
  if (roundHintEl) roundHintEl.textContent = hud.roundHint || "Round hint: --";
  updateCameraHealthCards();

  const stream = sharedState(now);
  const transport = getTransportSnapshot(now);
  diagStreamEl.textContent = `input: ${stream.inputMode.effective} (requested:${stream.inputMode.requested})`;
  diagLatencyEl.textContent =
    stream.inputMode.effective === "camera"
      ? `input age: ${stream.staleMs.toFixed(0)}ms`
      : "input age: n/a";
  diagActionsEl.textContent = `actions: L:${Number(state.lastActions.leftHandUp)} R:${Number(state.lastActions.rightHandUp)} S:${Number(state.lastActions.squat)}`;
  const avatarSkin = state.mode?.getAvatarSkin?.() ?? "n/a";
  const visualPreset = state.mode?.getVisualPreset?.() ?? "n/a";
  const cam0 = normalizeCameraRuntime(state.cameraRuntimeById?.[0] ?? {});
  const cam1 = normalizeCameraRuntime(state.cameraRuntimeById?.[1] ?? {});
  const cameraSummary = `cam0:${cam0.cameraStatus}/${cam0.reconnectAttempts} cam1:${cam1.cameraStatus}/${cam1.reconnectAttempts}`;
  diagSourceEl.textContent =
    `source: ${state.lastPayloadSource} health:${state.lastPipeline.healthScore.toFixed(0)} ` +
    `stride:${state.lastPipeline.inferenceStrideFrames.toFixed(0)} scale:${state.lastPipeline.inferenceScale.toFixed(2)} ` +
    `dual:${state.lastRuntime.dualReady ? "ready" : "degraded"} self:${state.lastRuntime.selfCheckStatus} ` +
    `skin:${avatarSkin} preset:${visualPreset} mode:${state.effectiveGameMode} ws:${transport.socketState} retry:${transport.retryCount} ${cameraSummary}`;
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
    resetRetryState();
    setConnectionState(false);
  } else {
    resetRetryState();
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

function setGameMode(mode) {
  state.requestedGameMode = normalizeGameMode(mode);
  syncGameModeSelect();
  refreshEffectiveGameMode(state.lastPayloadFrame);
  updateHud(getNow());
  return getGameMode();
}

function getGameMode() {
  return {
    requested: state.requestedGameMode,
    effective: state.effectiveGameMode,
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
  const cameras = Array.isArray(payload?.cameras) ? payload.cameras : [];
  const primaryCamera = cameras.find((item) => Number(item?.cameraId) === 0) ?? cameras[0] ?? null;
  const nextCameraRuntime = {
    0: { ...state.cameraRuntimeById?.[0], connected: false, cameraStatus: "UNKNOWN", cameraStatusReason: "camera offline" },
    1: { ...state.cameraRuntimeById?.[1], connected: false, cameraStatus: "UNKNOWN", cameraStatusReason: "camera offline" },
  };
  for (const camera of cameras) {
    const cameraId = Number(camera?.cameraId);
    if (!Number.isFinite(cameraId)) continue;
    if (cameraId !== 0 && cameraId !== 1) continue;
    nextCameraRuntime[cameraId] = normalizeCameraRuntime(camera);
  }
  state.cameraRuntimeById = nextCameraRuntime;
  state.lastActions = resolvePayloadActions(primaryCamera?.actions ?? payload.actions ?? {});
  state.lastPipeline = resolvePipelineMetrics(primaryCamera?.pipeline ?? payload.pipeline ?? {});
  state.lastRuntime = {
    ...state.lastRuntime,
    ...(payload?.runtime && typeof payload.runtime === "object" ? payload.runtime : {}),
  };
  state.mode?.onPose(payload, now, staleBeforeMs);
}

function injectPosePayload(actions = {}, options = {}) {
  const now = getNow();
  const staleBeforeMs = typeof options.staleBeforeMs === "number" ? options.staleBeforeMs : 0;
  const payload =
    options?.payload && typeof options.payload === "object"
      ? {
          type: "frame",
          ...options.payload,
        }
      : {
          type: "frame",
          actions: resolvePayloadActions(actions),
          pipeline: resolvePipelineMetrics(options.pipeline ?? {}),
          cameras: Array.isArray(options.cameras) ? options.cameras : undefined,
        };
  if (!payload.actions) payload.actions = resolvePayloadActions(actions);
  if (!payload.pipeline) payload.pipeline = resolvePipelineMetrics(options.pipeline ?? {});
  state.lastPayloadSource = options.source || "inject";
  state.lastPayloadFrame = payload;
  refreshEffectiveGameMode(payload);
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
  const raw = state.mode.renderToText(now, sharedState(now));
  try {
    const parsed = JSON.parse(raw);
    parsed.transport = getTransportSnapshot(now);
    parsed.cameraStatus = {
      cam0: normalizeCameraRuntime(state.cameraRuntimeById?.[0] ?? {}),
      cam1: normalizeCameraRuntime(state.cameraRuntimeById?.[1] ?? {}),
    };
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
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
window.set_game_mode = (mode) => setGameMode(mode);
window.get_game_mode = () => getGameMode();
window.get_transport_state = () => getTransportSnapshot(getNow());

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
if (gameModeEl) {
  gameModeEl.addEventListener("change", (event) => {
    const nextMode = event.target?.value;
    if (nextMode) setGameMode(nextMode);
  });
}

state.mode = createModeByKind("classic");
populateAvatarSkins();
populateVisualPresets();
syncInputModeSelect();
syncGameModeSelect();
applyDiagVisibility();
setConnectionState(false);
refreshEffectiveGameMode();
updateHud(getNow());
updateControlButtons();
requestAnimationFrame(renderFrame);
