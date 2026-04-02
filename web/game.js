const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const connEl = document.getElementById("conn");
const gameStatusEl = document.getElementById("gameStatus");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const hitsEl = document.getElementById("hits");
const laneEl = document.getElementById("lane");
const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnResume = document.getElementById("btnResume");
const btnRestart = document.getElementById("btnRestart");

const lanes = [340, 640, 940];
const playerY = 568;
const laneBlockWidth = 176;
const laneBlockHeight = 100;
const worldSpeedBase = 240;
const speedGainCap = 120;
const speedGainPerScore = 1.2;
const spawnMsBase = 1150;
const spawnMsDrop = 250;
const runnerDuration = 45;
const workoutDuration = 180;
const workoutMaxHp = 3;
const centerCommitMs = 30;
const laneSwitchLockMs = 70;
const streamFreezeMs = 300;
const fxDowngradeFps = 26;
const fxRecoverFps = 30;
const fxDowngradeWindow = 40;
const fxRecoverWindow = 120;
const trailLifetimeMs = 220;
const maxTrailHigh = 16;
const maxTrailLow = 7;
const maxExhaustHigh = 42;
const maxExhaustLow = 16;
const assetParallaxFar = 0.12;
const assetParallaxMid = 0.28;
const assetParallaxNear = 0.55;
const intervalSprintSec = 20;
const intervalRecoverSec = 10;
const intervalCycleSec = intervalSprintSec + intervalRecoverSec;
const reactionWindowMsDefault = 900;
const reactionWindowMsFast = 700;
const reactionFastBonusMs = 400;
const reactionHighSpeedMs = 5000;

const WORKOUT_MODES = {
  CLASSIC: "classic",
  SPRINT_LANE: "sprint_lane",
  SQUAT_GATE: "squat_gate",
  REACTION_DRILL: "reaction_drill",
};

const MODE_LABELS = {
  [WORKOUT_MODES.CLASSIC]: "Classic",
  [WORKOUT_MODES.SPRINT_LANE]: "Sprint Lane",
  [WORKOUT_MODES.SQUAT_GATE]: "Squat Gate",
  [WORKOUT_MODES.REACTION_DRILL]: "Reaction Drill",
};

const REACTION_TARGETS = [
  { key: "leftHandUp", label: "LEFT HAND", weight: 0.3 },
  { key: "rightHandUp", label: "RIGHT HAND", weight: 0.3 },
  { key: "squat", label: "SQUAT", weight: 0.25 },
  { key: "neutral", label: "HOLD CENTER", weight: 0.15 },
];

const assetCatalog = {
  player: "./assets/images/web-runner/player-jet.svg",
  gateDanger: "./assets/images/web-runner/gate-danger.svg",
  gateSafe: "./assets/images/web-runner/gate-safe.svg",
  bgFar: "./assets/images/web-runner/bg-far.svg",
  bgMid: "./assets/images/web-runner/bg-mid.svg",
  bgNear: "./assets/images/web-runner/bg-near.svg",
};

const urlParams = new URLSearchParams(window.location.search);
const visualConfig = {
  assetTheme: urlParams.get("assetTheme") || "neon",
  assetScale: clamp(Number(urlParams.get("assetScale") || 1), 0.6, 1.4),
  assetFallbackEnabled: (urlParams.get("assetFallbackEnabled") || "true") !== "false",
};

function normalizeMode(mode) {
  if (typeof mode !== "string") return WORKOUT_MODES.SPRINT_LANE;
  const candidate = mode.trim().toLowerCase();
  if (Object.values(WORKOUT_MODES).includes(candidate)) return candidate;
  return WORKOUT_MODES.SPRINT_LANE;
}

function isWorkoutMode(mode) {
  return mode !== WORKOUT_MODES.CLASSIC;
}

const runnerConfig = {
  defaultMode: normalizeMode(urlParams.get("mode") || WORKOUT_MODES.CLASSIC),
};

const state = {
  connected: false,
  lastPayloadTs: 0,
  time: {
    now: performance.now(),
  },
  py: {
    status: "READY",
    countdownSec: 0,
    hits: 0,
    fps: 0,
    actions: {},
    body: {},
    hands: {},
  },
  runner: {
    status: "READY",
    workoutMode: runnerConfig.defaultMode,
    lane: 1,
    intentLane: "hold",
    centerIntentSince: 0,
    switchFxUntil: 0,
    switchLockUntil: 0,
    score: 0,
    timeLeftSec: workoutDuration,
    hp: workoutMaxHp,
    maxHp: workoutMaxHp,
    shieldUntil: 0,
    hitFlashUntil: 0,
    missFlashUntil: 0,
    damageLockUntil: 0,
    obstacles: [],
    spawnAt: 0,
    lastStepAt: 0,
    intervalPhase: "sprint",
    intervalSecLeft: intervalSprintSec,
    intervalStartAt: 0,
    comboCount: 0,
    comboMultiplier: 1,
    maxCombo: 0,
    squatStreak: 0,
    reactionTarget: null,
    reactionIssuedAt: 0,
    reactionDeadlineAt: 0,
    reactionResolved: true,
    reactionNextAt: 0,
    reactionHighSpeedUntil: 0,
    reactionStreak: 0,
    stats: {
      actionsTotal: 0,
      actionsCorrect: 0,
      reactionHits: 0,
      reactionMsSum: 0,
      fastHits: 0,
    },
  },
  visual: {
    fxQuality: "high",
    lowFpsStreak: 0,
    recoverFpsStreak: 0,
    localFps: 60,
    renderMode: "procedural-fallback",
    assetsLoaded: false,
    assetFallbackReason: "assets-not-initialized",
    assetTheme: visualConfig.assetTheme,
    assetScale: visualConfig.assetScale,
    skyline: [],
    particles: [],
    trails: [],
    exhaust: [],
    lastBgAt: 0,
    worldOffset: 0,
  },
};

function getNow() {
  return state.time.now || performance.now();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function makeAssetRegistry() {
  return {
    player: null,
    gateDanger: null,
    gateSafe: null,
    bgFar: null,
    bgMid: null,
    bgNear: null,
  };
}

const loadedAssets = makeAssetRegistry();

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

async function preloadAssets() {
  try {
    const entries = Object.entries(assetCatalog);
    for (const [key, url] of entries) {
      // eslint-disable-next-line no-await-in-loop
      loadedAssets[key] = await loadImage(url);
    }
    state.visual.assetsLoaded = true;
    state.visual.assetFallbackReason = null;
    state.visual.renderMode = "asset-first";
  } catch (error) {
    state.visual.assetsLoaded = false;
    state.visual.renderMode = visualConfig.assetFallbackEnabled ? "procedural-fallback" : "asset-first";
    state.visual.assetFallbackReason = String(error?.message || "asset-load-failed");
  }
}

function getRunnerSpeed() {
  return worldSpeedBase + Math.min(speedGainCap, state.runner.score * speedGainPerScore);
}

function speedNormalized() {
  return clamp((getRunnerSpeed() - worldSpeedBase) / speedGainCap, 0, 1);
}

function updateFxQuality(now) {
  const visual = state.visual;
  if (visual.lastBgAt === 0) return;
  const dt = Math.max(1, now - visual.lastBgAt);
  const instant = 1000 / dt;
  visual.localFps = visual.localFps * 0.9 + instant * 0.1;

  if (visual.localFps < fxDowngradeFps) {
    visual.lowFpsStreak += 1;
    visual.recoverFpsStreak = 0;
  } else if (visual.localFps > fxRecoverFps) {
    visual.recoverFpsStreak += 1;
    visual.lowFpsStreak = Math.max(0, visual.lowFpsStreak - 1);
  } else {
    visual.lowFpsStreak = Math.max(0, visual.lowFpsStreak - 1);
    visual.recoverFpsStreak = Math.max(0, visual.recoverFpsStreak - 1);
  }

  if (visual.fxQuality === "high" && visual.lowFpsStreak >= fxDowngradeWindow) {
    visual.fxQuality = "low";
    visual.lowFpsStreak = 0;
  }
  if (visual.fxQuality === "low" && visual.recoverFpsStreak >= fxRecoverWindow) {
    visual.fxQuality = "high";
    visual.recoverFpsStreak = 0;
  }
}

function trimFxPools() {
  const visual = state.visual;
  const maxTrail = visual.fxQuality === "high" ? maxTrailHigh : maxTrailLow;
  const maxExhaust = visual.fxQuality === "high" ? maxExhaustHigh : maxExhaustLow;
  if (visual.trails.length > maxTrail) {
    visual.trails.splice(0, visual.trails.length - maxTrail);
  }
  if (visual.exhaust.length > maxExhaust) {
    visual.exhaust.splice(0, visual.exhaust.length - maxExhaust);
  }
}

function roundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function statusText(status) {
  if (status === "READY") return "待启动";
  if (status === "RUNNING") return "运行中";
  if (status === "PAUSED") return "已暂停";
  return "已结束";
}

function laneIntentLabel(desiredLane) {
  if (desiredLane === 0) return "left";
  if (desiredLane === 1) return "center";
  if (desiredLane === 2) return "right";
  return "hold";
}

function workoutModeLabel(mode) {
  return MODE_LABELS[mode] || MODE_LABELS[WORKOUT_MODES.CLASSIC];
}

function workoutSessionDuration(mode) {
  return mode === WORKOUT_MODES.CLASSIC ? runnerDuration : workoutDuration;
}

function workoutUpdateInterval(now) {
  const runner = state.runner;
  if (!isWorkoutMode(runner.workoutMode)) {
    runner.intervalPhase = "n/a";
    runner.intervalSecLeft = 0;
    return;
  }
  const elapsed = Math.max(0, (now - runner.intervalStartAt) / 1000);
  const inCycle = elapsed % intervalCycleSec;
  if (inCycle < intervalSprintSec) {
    runner.intervalPhase = "sprint";
    runner.intervalSecLeft = intervalSprintSec - inCycle;
  } else {
    runner.intervalPhase = "recover";
    runner.intervalSecLeft = intervalCycleSec - inCycle;
  }
}

function workoutResolveReactionInput(actions = {}) {
  const left = Boolean(actions.leftHandUp);
  const right = Boolean(actions.rightHandUp);
  const squat = Boolean(actions.squat);
  if (squat) return "squat";
  if (left && !right) return "leftHandUp";
  if (!left && right) return "rightHandUp";
  if (!left && !right) return "neutral";
  return "bothHands";
}

function workoutPickReactionTarget() {
  const r = Math.random();
  let acc = 0;
  for (const item of REACTION_TARGETS) {
    acc += item.weight;
    if (r <= acc) return item;
  }
  return REACTION_TARGETS[0];
}

function workoutReactionWindow(now) {
  return now <= state.runner.reactionHighSpeedUntil ? reactionWindowMsFast : reactionWindowMsDefault;
}

function workoutSetReactionTarget(now) {
  const runner = state.runner;
  const target = workoutPickReactionTarget();
  runner.reactionTarget = target.key;
  runner.reactionIssuedAt = now;
  runner.reactionDeadlineAt = now + workoutReactionWindow(now);
  runner.reactionResolved = false;
}

function workoutClearReactionTarget() {
  const runner = state.runner;
  runner.reactionTarget = null;
  runner.reactionIssuedAt = 0;
  runner.reactionDeadlineAt = 0;
  runner.reactionResolved = true;
}

function workoutRegisterMiss(now) {
  const runner = state.runner;
  if (now < runner.damageLockUntil) return false;
  runner.damageLockUntil = now + 220;
  runner.missFlashUntil = now + 180;
  runner.comboCount = 0;
  runner.comboMultiplier = 1;
  runner.squatStreak = 0;
  runner.reactionStreak = 0;
  if (runner.workoutMode === WORKOUT_MODES.CLASSIC) {
    setRunnerStatus("GAME_OVER");
    return true;
  }
  runner.hp = Math.max(0, runner.hp - 1);
  if (runner.hp <= 0) {
    setRunnerStatus("GAME_OVER");
  }
  return true;
}

function workoutRegisterLanePass(now) {
  const runner = state.runner;
  if (runner.workoutMode === WORKOUT_MODES.SPRINT_LANE) {
    runner.comboCount += 1;
    if (runner.comboCount % 5 === 0) {
      runner.comboMultiplier = Math.min(3, runner.comboMultiplier + 1);
    }
    runner.maxCombo = Math.max(runner.maxCombo, runner.comboCount);
    const phaseBoost = runner.intervalPhase === "sprint" ? 1.5 : 1;
    const points = Math.max(1, Math.round(phaseBoost * runner.comboMultiplier));
    runner.score += points;
  } else {
    runner.score += 1;
  }
  runner.hitFlashUntil = now + 120;
}

function workoutRegisterSquatPass(now) {
  const runner = state.runner;
  runner.squatStreak += 1;
  runner.comboCount = runner.squatStreak;
  runner.maxCombo = Math.max(runner.maxCombo, runner.comboCount);
  runner.score += 2;
  if (runner.squatStreak % 3 === 0) {
    runner.score += 2;
  }
  runner.hitFlashUntil = now + 120;
}

function workoutRegisterReactionPass(now, responseMs) {
  const runner = state.runner;
  runner.stats.actionsTotal += 1;
  runner.stats.actionsCorrect += 1;
  runner.stats.reactionHits += 1;
  runner.stats.reactionMsSum += responseMs;
  runner.reactionStreak += 1;
  runner.comboCount = runner.reactionStreak;
  runner.maxCombo = Math.max(runner.maxCombo, runner.comboCount);

  let points = 1;
  if (responseMs < reactionFastBonusMs) {
    points += 1;
    runner.stats.fastHits += 1;
  }
  if (now <= runner.reactionHighSpeedUntil) {
    points = Math.max(1, Math.round(points * 1.5));
  }
  runner.score += points;
  runner.hitFlashUntil = now + 120;

  if (runner.reactionStreak >= 8) {
    runner.reactionHighSpeedUntil = Math.max(runner.reactionHighSpeedUntil, now + reactionHighSpeedMs);
  }
  workoutClearReactionTarget();
  runner.reactionNextAt = now + 140;
}

function workoutSpawnDelayMs() {
  const runner = state.runner;
  switch (runner.workoutMode) {
    case WORKOUT_MODES.CLASSIC: {
      const elapsedRatio = Math.min(1, runner.score / 50);
      return spawnMsBase - elapsedRatio * spawnMsDrop;
    }
    case WORKOUT_MODES.SPRINT_LANE: {
      const base = runner.intervalPhase === "sprint" ? 760 : 1080;
      const scoreDrop = Math.min(220, runner.score * 4);
      return Math.max(420, base - scoreDrop);
    }
    case WORKOUT_MODES.SQUAT_GATE: {
      const elapsedSec = workoutSessionDuration(runner.workoutMode) - runner.timeLeftSec;
      const level = Math.min(5, Math.floor(elapsedSec / 30));
      return Math.max(520, 980 - level * 45);
    }
    default:
      return Infinity;
  }
}

function workoutObstacleSpeed() {
  const runner = state.runner;
  let speed = worldSpeedBase + Math.min(speedGainCap, runner.score * speedGainPerScore);
  if (runner.workoutMode === WORKOUT_MODES.SPRINT_LANE) {
    speed *= runner.intervalPhase === "sprint" ? 1.12 : 0.92;
  }
  if (runner.workoutMode === WORKOUT_MODES.SQUAT_GATE) {
    const elapsedSec = workoutSessionDuration(runner.workoutMode) - runner.timeLeftSec;
    const level = Math.min(5, Math.floor(elapsedSec / 30));
    speed *= 0.85 + level * 0.05;
  }
  return speed;
}

function workoutTickReaction(now) {
  const runner = state.runner;
  if (runner.workoutMode !== WORKOUT_MODES.REACTION_DRILL || runner.status !== "RUNNING") return;
  if (!runner.reactionTarget && now >= runner.reactionNextAt) {
    workoutSetReactionTarget(now);
    return;
  }
  if (runner.reactionTarget && !runner.reactionResolved && now > runner.reactionDeadlineAt) {
    runner.stats.actionsTotal += 1;
    workoutClearReactionTarget();
    runner.reactionNextAt = now + 280;
    workoutRegisterMiss(now);
  }
}

function updateControlButtons() {
  const status = state.runner.status;
  btnStart.disabled = status === "RUNNING" || status === "PAUSED";
  btnPause.disabled = status !== "RUNNING";
  btnResume.disabled = status !== "PAUSED";
  btnRestart.disabled = status === "READY";
}

function setRunnerStatus(nextStatus) {
  state.runner.status = nextStatus;
  updateControlButtons();
}

function switchWorkoutMode(mode) {
  state.runner.workoutMode = normalizeMode(mode);
  startGame();
}

function resolveDesiredLane(payload) {
  const leftUp = Boolean(payload.actions?.leftHandUp);
  const rightUp = Boolean(payload.actions?.rightHandUp);
  if (leftUp && !rightUp) return 0;
  if (!leftUp && rightUp) return 2;
  if (!leftUp && !rightUp) return 1;
  return null;
}

function applyLaneImmediately(desiredLane, now = getNow()) {
  const runner = state.runner;
  runner.intentLane = laneIntentLabel(desiredLane);
  if (desiredLane == null) return;

  const sideLaneInput = desiredLane === 0 || desiredLane === 2;
  if (sideLaneInput && now < runner.switchLockUntil && desiredLane !== runner.lane) {
    return;
  }

  const lastLane = runner.lane;
  if (sideLaneInput) {
    runner.centerIntentSince = 0;
    runner.lane = desiredLane;
  } else if (desiredLane === 1) {
    if (runner.lane === 1) {
      runner.centerIntentSince = 0;
    } else if (runner.centerIntentSince === 0) {
      runner.centerIntentSince = now;
    } else if (now - runner.centerIntentSince >= centerCommitMs) {
      runner.lane = 1;
      runner.centerIntentSince = 0;
    }
  }

  if (runner.lane !== lastLane) {
    runner.switchFxUntil = now + 180;
    if (runner.lane === 0 || runner.lane === 2) {
      runner.switchLockUntil = now + laneSwitchLockMs;
    } else {
      runner.switchLockUntil = 0;
    }
  }
}

function resetRunner(now) {
  const runner = state.runner;
  runner.score = 0;
  runner.timeLeftSec = workoutSessionDuration(runner.workoutMode);
  runner.maxHp = isWorkoutMode(runner.workoutMode) ? workoutMaxHp : 1;
  runner.hp = runner.maxHp;
  runner.shieldUntil = 0;
  runner.hitFlashUntil = 0;
  runner.missFlashUntil = 0;
  runner.damageLockUntil = 0;
  runner.obstacles = [];
  runner.spawnAt = now + 300;
  runner.lastStepAt = now;
  runner.intentLane = "hold";
  runner.centerIntentSince = 0;
  runner.switchFxUntil = 0;
  runner.switchLockUntil = 0;
  runner.intervalPhase = isWorkoutMode(runner.workoutMode) ? "sprint" : "n/a";
  runner.intervalSecLeft = isWorkoutMode(runner.workoutMode) ? intervalSprintSec : 0;
  runner.intervalStartAt = now;
  runner.comboCount = 0;
  runner.comboMultiplier = 1;
  runner.maxCombo = 0;
  runner.squatStreak = 0;
  runner.reactionTarget = null;
  runner.reactionIssuedAt = 0;
  runner.reactionDeadlineAt = 0;
  runner.reactionResolved = true;
  runner.reactionNextAt = now + 420;
  runner.reactionHighSpeedUntil = 0;
  runner.reactionStreak = 0;
  runner.stats = {
    actionsTotal: 0,
    actionsCorrect: 0,
    reactionHits: 0,
    reactionMsSum: 0,
    fastHits: 0,
  };
  state.visual.trails = [];
  state.visual.exhaust = [];
}

function startGame() {
  const now = getNow();
  resetRunner(now);
  setRunnerStatus("RUNNING");
}

function pauseGame() {
  if (state.runner.status !== "RUNNING") return;
  setRunnerStatus("PAUSED");
}

function resumeGame() {
  if (state.runner.status !== "PAUSED") return;
  state.runner.lastStepAt = getNow();
  setRunnerStatus("RUNNING");
}

function restartGame() {
  startGame();
}

function connect() {
  const ws = new WebSocket("ws://127.0.0.1:8765");
  ws.onopen = () => {
    state.connected = true;
    connEl.textContent = "已连接姿态服务";
    connEl.style.color = "#3ce58f";
  };
  ws.onclose = () => {
    state.connected = false;
    connEl.textContent = "连接断开，正在重连…";
    connEl.style.color = "#ffd76e";
    setTimeout(connect, 1000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.type !== "frame") return;
      const now = getNow();
      const staleBeforeMs = state.lastPayloadTs === 0 ? 0 : now - state.lastPayloadTs;
      state.py = payload;
      onPose(payload, now, staleBeforeMs);
      state.lastPayloadTs = now;
    } catch {
      // ignore malformed packets
    }
  };
}

function onPose(payload, now = getNow(), staleBeforeMs = 0) {
  if (staleBeforeMs > streamFreezeMs) {
    state.runner.intentLane = "hold";
    state.runner.centerIntentSince = 0;
    return;
  }
  applyLaneImmediately(resolveDesiredLane(payload), now);
  const runner = state.runner;
  if (runner.workoutMode !== WORKOUT_MODES.REACTION_DRILL) return;
  if (runner.status !== "RUNNING" || runner.reactionResolved || !runner.reactionTarget) return;

  const actionKey = workoutResolveReactionInput(payload.actions || {});
  if (actionKey === runner.reactionTarget) {
    workoutRegisterReactionPass(now, Math.max(0, now - runner.reactionIssuedAt));
    return;
  }

  if (actionKey !== "neutral" || runner.reactionTarget === "neutral" || actionKey === "bothHands") {
    runner.stats.actionsTotal += 1;
    workoutClearReactionTarget();
    runner.reactionNextAt = now + 260;
    workoutRegisterMiss(now);
  }
}

function spawnObstacle(now) {
  const runner = state.runner;
  if (runner.workoutMode === WORKOUT_MODES.SQUAT_GATE) {
    runner.obstacles.push({
      kind: "squat_gate",
      y: -laneBlockHeight,
      checked: false,
      seed: Math.random(),
      bornAt: now,
    });
  } else {
    const safeLane = Math.floor(Math.random() * 3);
    runner.obstacles.push({
      kind: "lane_gate",
      y: -laneBlockHeight,
      safeLane,
      checked: false,
      seed: Math.random(),
      bornAt: now,
    });
  }
  runner.spawnAt = now + workoutSpawnDelayMs();
}

function step(now) {
  const runner = state.runner;
  if (runner.status !== "RUNNING") return;

  if (runner.lastStepAt === 0) runner.lastStepAt = now;
  const dt = (now - runner.lastStepAt) / 1000;
  runner.lastStepAt = now;

  runner.timeLeftSec = Math.max(0, runner.timeLeftSec - dt);
  if (runner.timeLeftSec <= 0) {
    setRunnerStatus("GAME_OVER");
    return;
  }

  workoutUpdateInterval(now);
  workoutTickReaction(now);
  if (runner.status !== "RUNNING") return;

  if (runner.workoutMode !== WORKOUT_MODES.REACTION_DRILL) {
    const speed = workoutObstacleSpeed();
    for (const obs of runner.obstacles) {
      obs.y += speed * dt;
    }
    runner.obstacles = runner.obstacles.filter((o) => o.y - laneBlockHeight < canvas.height + 50);
    if (now >= runner.spawnAt) {
      spawnObstacle(now);
    }
  }

  if (runner.workoutMode !== WORKOUT_MODES.REACTION_DRILL && state.py.actions?.squat) {
    runner.shieldUntil = Math.max(runner.shieldUntil, now + 350);
  }

  for (const obs of runner.obstacles) {
    if (obs.checked || obs.y < playerY - laneBlockHeight * 0.34) continue;
    obs.checked = true;

    if (obs.kind === "squat_gate") {
      if (state.py.actions?.squat) {
        workoutRegisterSquatPass(now);
      } else {
        workoutRegisterMiss(now);
      }
      continue;
    }

    const laneMatched = obs.safeLane === runner.lane;
    const shielded = now <= runner.shieldUntil;
    if (laneMatched || shielded) {
      workoutRegisterLanePass(now);
    } else if (workoutRegisterMiss(now) && runner.status !== "RUNNING") {
      break;
    }
  }
}

function initVisuals() {
  if (state.visual.skyline.length > 0) return;
  for (let i = 0; i < 28; i += 1) {
    state.visual.skyline.push({
      x: i * 54,
      w: 42 + Math.random() * 28,
      h: 80 + Math.random() * 170,
      glow: 0.2 + Math.random() * 0.45,
    });
  }
  for (let i = 0; i < 50; i += 1) {
    state.visual.particles.push({
      x: randomRange(0, canvas.width),
      y: randomRange(0, canvas.height),
      speed: randomRange(18, 70),
      size: randomRange(2, 6.5),
      drift: randomRange(-14, 14),
      phase: randomRange(0, Math.PI * 2),
      alpha: randomRange(0.35, 0.8),
      hue: Math.random() > 0.55 ? "pink" : "cyan",
    });
  }
}

function updateParticles(now) {
  const visual = state.visual;
  if (visual.lastBgAt === 0) visual.lastBgAt = now;
  updateFxQuality(now);
  const dt = clamp((now - visual.lastBgAt) / 1000, 0, 0.08);
  visual.lastBgAt = now;

  for (const p of visual.particles) {
    p.y += p.speed * dt;
    p.x += Math.sin(now * 0.0013 + p.phase) * p.drift * dt;
    if (p.y > canvas.height + 14) {
      p.y = -12;
      p.x = randomRange(0, canvas.width);
    }
    if (p.x < -20) p.x = canvas.width + 10;
    if (p.x > canvas.width + 20) p.x = -10;
  }
}

function updateRunnerFx(now) {
  const visual = state.visual;
  const speedN = speedNormalized();
  const laneX = lanes[state.runner.lane];
  const y = playerY;

  const maxTrail = visual.fxQuality === "high" ? maxTrailHigh : maxTrailLow;
  visual.trails.push({
    x: laneX,
    y,
    at: now,
    tilt: speedN,
  });
  if (visual.trails.length > maxTrail) {
    visual.trails.splice(0, visual.trails.length - maxTrail);
  }

  const particleBurst = visual.fxQuality === "high" ? 2 : 1;
  for (let i = 0; i < particleBurst; i += 1) {
    visual.exhaust.push({
      x: laneX + randomRange(-6, 6),
      y: y + 18 + randomRange(-4, 4),
      vx: randomRange(-26, 26),
      vy: randomRange(42, 88) * (1 + speedN * 0.6),
      size: randomRange(2.5, 5.8),
      life: randomRange(150, 230),
      at: now,
      hue: Math.random() > 0.5 ? "gold" : "pink",
    });
  }

  const maxExhaust = visual.fxQuality === "high" ? maxExhaustHigh : maxExhaustLow;
  if (visual.exhaust.length > maxExhaust) {
    visual.exhaust.splice(0, visual.exhaust.length - maxExhaust);
  }

  trimFxPools();
}

function drawBackground(now) {
  initVisuals();
  updateParticles(now);

  if (canUseAssetMode()) {
    drawBackgroundAsset(now);
    return;
  }

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#1f1b47");
  sky.addColorStop(0.5, "#182f63");
  sky.addColorStop(1, "#0d1632");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const moonX = canvas.width * 0.17;
  const moonY = 130;
  const moon = ctx.createRadialGradient(moonX, moonY, 20, moonX, moonY, 108);
  moon.addColorStop(0, "#fff6d0");
  moon.addColorStop(1, "#fff6d000");
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 108, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#101633";
  for (const b of state.visual.skyline) {
    ctx.fillRect(b.x, canvas.height - b.h - 84, b.w, b.h);
    ctx.fillStyle = `rgba(79,248,255,${b.glow * 0.18})`;
    ctx.fillRect(b.x + 7, canvas.height - b.h - 72, 4, b.h * 0.55);
    ctx.fillStyle = "#101633";
  }
  ctx.fillStyle = "#070c22";
  ctx.fillRect(0, canvas.height - 86, canvas.width, 86);

  for (let i = 0; i < 38; i += 1) {
    const y = ((now * 0.33 + i * 38) % (canvas.height + 120)) - 120;
    const alpha = 0.05 + (i % 5) * 0.01;
    ctx.strokeStyle = `rgba(128,164,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y + 80);
    ctx.stroke();
  }

  const particleLimit = state.visual.fxQuality === "high" ? state.visual.particles.length : 24;
  for (let i = 0; i < particleLimit; i += 1) {
    const p = state.visual.particles[i];
    const color = p.hue === "pink" ? `rgba(255,120,197,${p.alpha})` : `rgba(117,248,255,${p.alpha})`;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(now * 0.001 + p.phase) * 0.6);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < 3; i += 1) {
    const x = lanes[i];
    const glow = ctx.createLinearGradient(x - 2, 0, x + 2, 0);
    glow.addColorStop(0, "#4ff8ff00");
    glow.addColorStop(0.5, i === state.runner.lane ? "#ff54b0b5" : "#4ff8ff99");
    glow.addColorStop(1, "#4ff8ff00");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 2, 0, 4, canvas.height);
  }
}

function drawTrails(now) {
  const trails = state.visual.trails;
  if (!trails.length) return;
  for (let i = 0; i < trails.length; i += 1) {
    const t = trails[i];
    const age = now - t.at;
    if (age > trailLifetimeMs) continue;
    const fade = 1 - age / trailLifetimeMs;
    const width = 22 + t.tilt * 20;
    const height = 10 + t.tilt * 6;
    ctx.fillStyle = `rgba(130,240,255,${0.12 * fade})`;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 2, width, height, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,120,197,${0.09 * fade})`;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 7, width * 0.6, height * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  state.visual.trails = trails.filter((item) => now - item.at <= trailLifetimeMs);
}

function drawExhaust(now) {
  const visual = state.visual;
  if (!visual.exhaust.length) return;
  const dt = 1000 / 60;
  const next = [];
  for (const p of visual.exhaust) {
    const age = now - p.at;
    if (age > p.life) continue;
    p.x += p.vx * (dt / 1000);
    p.y += p.vy * (dt / 1000);
    p.vy *= 0.985;
    p.vx *= 0.97;
    const fade = 1 - age / p.life;
    const color =
      p.hue === "gold"
        ? `rgba(255,201,124,${0.42 * fade})`
        : `rgba(255,132,206,${0.32 * fade})`;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.size * fade, p.size * 0.58 * fade, 0, 0, Math.PI * 2);
    ctx.fill();
    next.push(p);
  }
  visual.exhaust = next;
}

function canUseAssetMode() {
  return state.visual.renderMode === "asset-first";
}

function drawLayerTiled(image, offsetX, y, scale = 1) {
  if (!image) return;
  const drawHeight = canvas.height * scale;
  const ratio = image.width > 0 ? image.width / image.height : 1;
  const tileWidth = drawHeight * ratio;
  if (tileWidth <= 2) return;
  let x = -((offsetX % tileWidth) + tileWidth);
  while (x < canvas.width + tileWidth) {
    ctx.drawImage(image, x, y, tileWidth, drawHeight);
    x += tileWidth;
  }
}

function drawBackgroundAsset(now) {
  const visual = state.visual;
  const speed = getRunnerSpeed();
  visual.worldOffset += speed * 0.0035;

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#181a3f");
  sky.addColorStop(0.5, "#182f63");
  sky.addColorStop(1, "#07142f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLayerTiled(loadedAssets.bgFar, visual.worldOffset * assetParallaxFar, 0, 1);
  drawLayerTiled(loadedAssets.bgMid, visual.worldOffset * assetParallaxMid, canvas.height * 0.08, 0.9);
  drawLayerTiled(loadedAssets.bgNear, visual.worldOffset * assetParallaxNear, canvas.height * 0.24, 0.76);
}

function drawPlayerAsset(now) {
  const image = loadedAssets.player;
  if (!image) return false;
  const speedN = speedNormalized();
  const x = lanes[state.runner.lane];
  const y = playerY;
  const jitter = Math.sin(now * (0.017 + speedN * 0.011)) * (2.2 + speedN * 1.8);
  const tilt = speedN * 0.2;
  const baseW = 138 * state.visual.assetScale;
  const baseH = 98 * state.visual.assetScale;
  const w = baseW * (1 + speedN * 0.08);
  const h = baseH * (1 + speedN * 0.08);

  ctx.save();
  ctx.translate(x, y + jitter);
  ctx.rotate(tilt);
  ctx.globalAlpha = 0.96;
  ctx.drawImage(image, -w / 2, -h / 2 - 8, w, h);
  ctx.restore();
  return true;
}

function drawGateAsset(image, laneX, y, appear, now, safe) {
  if (!image) return false;
  const wobble = safe ? Math.sin(now * 0.012) * 2 : Math.sin(now * 0.018) * 1.5;
  const scale = (0.9 + appear * 0.1) * state.visual.assetScale;
  const w = laneBlockWidth * scale;
  const h = laneBlockHeight * scale;
  ctx.save();
  ctx.globalAlpha = 0.4 + appear * 0.6;
  ctx.drawImage(image, laneX - w / 2, y - h / 2 + wobble, w, h);
  ctx.restore();
  return true;
}

function drawPlayer(now) {
  const lane = state.runner.lane;
  const x = lanes[lane];
  const shield = now <= state.runner.shieldUntil;
  const speedN = speedNormalized();
  const useAsset = canUseAssetMode();
  const fallbackAllowed = !useAsset || visualConfig.assetFallbackEnabled;
  const usedAsset = useAsset && drawPlayerAsset(now);

  ctx.fillStyle = "rgba(32,44,98,0.56)";
  ctx.beginPath();
  ctx.ellipse(x, playerY + 24, 78 + speedN * 16, 16 + speedN * 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!usedAsset && fallbackAllowed) {
    const jitter = Math.sin(now * (0.017 + speedN * 0.011)) * (2.6 + speedN * 2.2);
    const tilt = speedN * 0.16;
    ctx.save();
    ctx.translate(x, playerY + jitter);
    ctx.rotate(tilt);

    ctx.fillStyle = "#1f2f70";
    ctx.beginPath();
    ctx.moveTo(-48, 6);
    ctx.lineTo(-22, -30);
    ctx.lineTo(22, -30);
    ctx.lineTo(48, 6);
    ctx.lineTo(0, 24);
    ctx.closePath();
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(-40, -24, 40, 20);
    bodyGrad.addColorStop(0, "#56f6ff");
    bodyGrad.addColorStop(1, "#ff6ac1");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.lineTo(-11, -22);
    ctx.lineTo(11, -22);
    ctx.lineTo(34, 0);
    ctx.lineTo(0, 13);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#c5f8ff";
    ctx.beginPath();
    ctx.ellipse(0, -6, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,176,94,0.9)";
    ctx.beginPath();
    ctx.moveTo(-10, 12);
    ctx.lineTo(0, 34 + Math.sin(now * (0.022 + speedN * 0.012)) * (4 + speedN * 2));
    ctx.lineTo(10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (now <= state.runner.switchFxUntil) {
    const t = (state.runner.switchFxUntil - now) / 180;
    ctx.strokeStyle = `rgba(79,248,255,${0.55 * t})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, playerY, 44 + (1 - t) * 22, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (shield) {
    const pulse = 46 + Math.sin(now * 0.021) * 3.8;
    ctx.strokeStyle = "rgba(125,255,192,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, playerY, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(125,255,192,0.3)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(x, playerY, pulse + 8, 0, Math.PI * 2);
    ctx.stroke();

    // Animated twin arcs to strengthen shield readability.
    const spin = now * 0.006;
    ctx.strokeStyle = "rgba(116,255,214,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, playerY, pulse + 12, spin, spin + Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, playerY, pulse + 12, spin + Math.PI, spin + Math.PI * 1.85);
    ctx.stroke();
  }
}

function drawBlockedGate(laneX, y, seed, now, appear) {
  const x = laneX - laneBlockWidth / 2;
  const top = y - laneBlockHeight / 2;
  const scanPhase = ((now * 0.18 + seed * 90) % (laneBlockHeight + 28)) - 14;
  ctx.save();
  ctx.globalAlpha = 0.45 + appear * 0.55;
  roundedRectPath(x, top, laneBlockWidth, laneBlockHeight, 18);
  const grad = ctx.createLinearGradient(x, top, x + laneBlockWidth, top + laneBlockHeight);
  grad.addColorStop(0, "#752b95");
  grad.addColorStop(1, "#d83d7e");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  roundedRectPath(x + 7, top + 7, laneBlockWidth - 14, laneBlockHeight - 14, 12);
  ctx.clip();
  ctx.fillStyle = "rgba(24,16,36,0.76)";
  ctx.fillRect(x, top, laneBlockWidth, laneBlockHeight);
  for (let i = -2; i < 10; i += 1) {
    const stripeX = x + i * 24 + ((seed * 80) % 18);
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,84,176,0.35)" : "rgba(255,215,110,0.28)";
    ctx.fillRect(stripeX, top - 4, 12, laneBlockHeight + 8);
  }
  ctx.fillStyle = "rgba(255,238,180,0.2)";
  ctx.fillRect(x + 6, top + scanPhase, laneBlockWidth - 12, 10);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,220,248,0.6)";
  ctx.lineWidth = 2;
  roundedRectPath(x, top, laneBlockWidth, laneBlockHeight, 18);
  ctx.stroke();
  ctx.restore();
}

function drawSafePortal(laneX, y, now, appear) {
  const x = laneX - laneBlockWidth / 2 - 8;
  const top = y - laneBlockHeight / 2 - 8;
  const w = laneBlockWidth + 16;
  const h = laneBlockHeight + 16;
  const pulse = 0.55 + (Math.sin(now * 0.012) + 1) * 0.2;
  ctx.save();
  ctx.globalAlpha = 0.42 + appear * 0.58;
  ctx.strokeStyle = `rgba(79,248,255,${pulse})`;
  ctx.lineWidth = 3;
  roundedRectPath(x, top, w, h, 20);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,84,176,${pulse * 0.75})`;
  ctx.lineWidth = 1.5;
  roundedRectPath(x + 5, top + 5, w - 10, h - 10, 15);
  ctx.stroke();
  ctx.restore();
}

function drawWorkoutSquatGate(obs, now) {
  const appear = clamp((now - (obs.bornAt ?? now)) / 260, 0, 1);
  const y = obs.y - laneBlockHeight * 0.4;
  const h = laneBlockHeight * 0.8;
  const pulse = 0.6 + (Math.sin(now * 0.01) + 1) * 0.2;
  ctx.save();
  ctx.globalAlpha = 0.45 + appear * 0.55;
  const grad = ctx.createLinearGradient(180, y, canvas.width - 180, y + h);
  grad.addColorStop(0, "#35d7ff");
  grad.addColorStop(0.5, "#7af8d5");
  grad.addColorStop(1, "#35d7ff");
  ctx.fillStyle = grad;
  roundedRectPath(180, y, canvas.width - 360, h, 16);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
  ctx.lineWidth = 2;
  roundedRectPath(186, y + 6, canvas.width - 372, h - 12, 10);
  ctx.stroke();
  ctx.restore();
}

function drawObstacle(obs, now) {
  if (obs.kind === "squat_gate") {
    drawWorkoutSquatGate(obs, now);
    return;
  }
  const appear = clamp((now - (obs.bornAt ?? now)) / 260, 0, 1);
  const useAsset = canUseAssetMode();
  const fallbackAllowed = !useAsset || visualConfig.assetFallbackEnabled;
  for (let i = 0; i < 3; i += 1) {
    if (i === obs.safeLane) continue;
    if (!useAsset || !drawGateAsset(loadedAssets.gateDanger, lanes[i], obs.y, appear, now, false)) {
      if (!fallbackAllowed) continue;
      drawBlockedGate(lanes[i], obs.y, obs.seed, now, appear);
    }
  }
  if (!useAsset || !drawGateAsset(loadedAssets.gateSafe, lanes[obs.safeLane], obs.y, appear, now, true)) {
    if (!fallbackAllowed) return;
    drawSafePortal(lanes[obs.safeLane], obs.y, now, appear);
  }
}

function drawOverlay(now) {
  const py = state.py;
  const connectionStale = now - state.lastPayloadTs > 1300;
  gameStatusEl.textContent = `状态: ${statusText(state.runner.status)}`;
  timerEl.textContent = `时间: ${Math.max(0, state.runner.timeLeftSec ?? runnerDuration).toFixed(1)}s`;
  scoreEl.textContent = `生存分: ${state.runner.score}`;
  hitsEl.textContent = `识别命中: ${py.hits ?? 0}`;
  laneEl.textContent = `通道: ${["左", "中", "右"][state.runner.lane]}`;

  if (connectionStale) {
    ctx.fillStyle = "rgba(255,215,110,0.18)";
    roundedRectPath(26, 24, 380, 48, 11);
    ctx.fill();
    ctx.fillStyle = "#ffe8a1";
    ctx.font = "700 23px Trebuchet MS";
    ctx.fillText("Waiting Pose Stream…", 42, 57);
  }

  if (now <= state.runner.hitFlashUntil) {
    const fade = 1 - (state.runner.hitFlashUntil - now) / 130;
    ctx.fillStyle = `rgba(96,255,190,${0.12 * (1 - fade)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (now <= state.runner.missFlashUntil) {
    const fade = 1 - (state.runner.missFlashUntil - now) / 180;
    ctx.fillStyle = `rgba(255,86,160,${0.16 * (1 - fade)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.runner.status === "GAME_OVER") {
    ctx.fillStyle = "rgba(8,10,24,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,84,176,0.55)";
    ctx.lineWidth = 2;
    roundedRectPath(canvas.width / 2 - 270, 200, 540, 230, 22);
    ctx.stroke();

    ctx.fillStyle = "#ff8ab7";
    ctx.font = "900 70px Trebuchet MS";
    ctx.fillText("MISSION FAILED", canvas.width / 2 - 265, 285);
    ctx.fillStyle = "#eaf2ff";
    ctx.font = "700 34px Trebuchet MS";
    ctx.fillText(`Score ${state.runner.score}`, canvas.width / 2 - 75, 336);
    ctx.font = "600 24px Trebuchet MS";
    ctx.fillText("点击“重开”再来一局", canvas.width / 2 - 110, 385);
  } else if (state.runner.status === "PAUSED") {
    ctx.fillStyle = "rgba(10,10,24,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffe18a";
    ctx.font = "800 64px Trebuchet MS";
    ctx.fillText("PAUSED", canvas.width / 2 - 126, 320);
  } else if (state.runner.status === "READY") {
    ctx.fillStyle = "rgba(8,10,22,0.42)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#98f0ff";
    ctx.font = "800 48px Trebuchet MS";
    ctx.fillText("点击“启动”进入赛道", canvas.width / 2 - 208, 310);
  }
}

function drawOverlayV21(now) {
  const py = state.py;
  const runner = state.runner;
  const connectionStale = now - state.lastPayloadTs > 1300;
  gameStatusEl.textContent = `Status: ${runner.status} | ${workoutModeLabel(runner.workoutMode)}`;
  timerEl.textContent = `Time: ${Math.max(0, runner.timeLeftSec ?? runnerDuration).toFixed(1)}s`;
  scoreEl.textContent = `Score: ${runner.score}`;
  hitsEl.textContent = `Pose Hits: ${py.hits ?? 0}`;
  laneEl.textContent = `Lane: ${["Left", "Middle", "Right"][runner.lane]}`;

  if (connectionStale) {
    ctx.fillStyle = "rgba(255,215,110,0.18)";
    roundedRectPath(26, 24, 380, 48, 11);
    ctx.fill();
    ctx.fillStyle = "#ffe8a1";
    ctx.font = "700 23px Trebuchet MS";
    ctx.fillText("Waiting Pose Stream...", 42, 57);
  }

  if (now <= runner.hitFlashUntil) {
    const fade = 1 - (runner.hitFlashUntil - now) / 130;
    ctx.fillStyle = `rgba(96,255,190,${0.12 * (1 - fade)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (now <= runner.missFlashUntil) {
    const fade = 1 - (runner.missFlashUntil - now) / 180;
    ctx.fillStyle = `rgba(255,86,160,${0.16 * (1 - fade)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const phaseColor = runner.intervalPhase === "sprint" ? "#ff9f5e" : "#60f0ff";
  ctx.fillStyle = "rgba(8,14,30,0.58)";
  roundedRectPath(20, 74, 440, 84, 12);
  ctx.fill();
  ctx.fillStyle = "#d9ecff";
  ctx.font = "700 20px Trebuchet MS";
  ctx.fillText(`Mode ${workoutModeLabel(runner.workoutMode)}`, 36, 106);
  ctx.fillStyle = phaseColor;
  ctx.font = "700 18px Trebuchet MS";
  ctx.fillText(`Phase ${runner.intervalPhase} ${Math.ceil(Math.max(0, runner.intervalSecLeft || 0))}s`, 36, 132);
  ctx.fillStyle = "#8ff7c2";
  ctx.fillText(`HP ${runner.hp}/${runner.maxHp} | Combo ${runner.comboCount}`, 240, 132);

  if (runner.workoutMode === WORKOUT_MODES.REACTION_DRILL && runner.reactionTarget) {
    const target = REACTION_TARGETS.find((item) => item.key === runner.reactionTarget);
    const msLeft = Math.max(0, runner.reactionDeadlineAt - now);
    ctx.fillStyle = "rgba(18,26,56,0.72)";
    roundedRectPath(canvas.width / 2 - 190, 86, 380, 82, 12);
    ctx.fill();
    ctx.fillStyle = "#ffd27d";
    ctx.font = "700 20px Trebuchet MS";
    ctx.fillText(`React: ${target ? target.label : runner.reactionTarget}`, canvas.width / 2 - 170, 122);
    ctx.fillStyle = "#9af8ff";
    ctx.fillText(`Window: ${msLeft.toFixed(0)}ms`, canvas.width / 2 - 170, 146);
  }

  if (runner.status === "GAME_OVER") {
    const avgReactionMs =
      runner.stats.reactionHits > 0 ? runner.stats.reactionMsSum / runner.stats.reactionHits : 0;
    const accuracy =
      runner.stats.actionsTotal > 0 ? (runner.stats.actionsCorrect / runner.stats.actionsTotal) * 100 : 0;
    ctx.fillStyle = "rgba(8,10,24,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,84,176,0.55)";
    ctx.lineWidth = 2;
    roundedRectPath(canvas.width / 2 - 300, 190, 600, 260, 22);
    ctx.stroke();

    ctx.fillStyle = "#ff8ab7";
    ctx.font = "900 62px Trebuchet MS";
    ctx.fillText("SESSION COMPLETE", canvas.width / 2 - 280, 275);
    ctx.fillStyle = "#eaf2ff";
    ctx.font = "700 28px Trebuchet MS";
    ctx.fillText(`Score ${runner.score}  |  Max Combo ${runner.maxCombo}`, canvas.width / 2 - 236, 326);
    ctx.font = "600 22px Trebuchet MS";
    ctx.fillText(
      `Accuracy ${accuracy.toFixed(1)}%  |  Avg Reaction ${avgReactionMs.toFixed(0)}ms`,
      canvas.width / 2 - 236,
      362,
    );
    ctx.fillText("Press Restart to run another round", canvas.width / 2 - 182, 396);
  } else if (runner.status === "PAUSED") {
    ctx.fillStyle = "rgba(10,10,24,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffe18a";
    ctx.font = "800 64px Trebuchet MS";
    ctx.fillText("PAUSED", canvas.width / 2 - 126, 320);
  } else if (runner.status === "READY") {
    ctx.fillStyle = "rgba(8,10,22,0.42)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#98f0ff";
    ctx.font = "800 42px Trebuchet MS";
    ctx.fillText("Press Start to begin", canvas.width / 2 - 180, 312);
  }
}

function renderAt(now) {
  state.time.now = now;
  drawBackground(now);
  step(now);
  if (state.runner.status === "RUNNING") {
    updateRunnerFx(now);
  }
  drawTrails(now);
  for (const obs of state.runner.obstacles) {
    drawObstacle(obs, now);
  }
  drawExhaust(now);
  drawPlayer(now);
  drawOverlayV21(now);
}

function animationLoop(now) {
  renderAt(now);
  requestAnimationFrame(animationLoop);
}

function renderGameToText() {
  const now = getNow();
  const connectionStaleMs = Math.max(0, now - state.lastPayloadTs);
  const switchLockMsLeft = Math.max(0, state.runner.switchLockUntil - now);
  const centerCommitMsLeft =
    state.runner.centerIntentSince > 0
      ? Math.max(0, centerCommitMs - (now - state.runner.centerIntentSince))
      : 0;
  const payload = {
    coordinateSystem: {
      origin: "top-left",
      xAxis: "right-positive",
      yAxis: "down-positive",
      unit: "pixel",
    },
    mode: state.runner.status,
    laneIndex: state.runner.lane,
    laneLabel: ["left", "middle", "right"][state.runner.lane],
    score: state.runner.score,
    timeLeftSec: Number(state.runner.timeLeftSec.toFixed(2)),
    shieldActive: now <= state.runner.shieldUntil,
    player: {
      x: lanes[state.runner.lane],
      y: playerY,
    },
    obstacles: state.runner.obstacles.slice(0, 8).map((o) => ({
      y: Number(o.y.toFixed(1)),
      safeLane: o.safeLane,
      checked: o.checked,
    })),
    stream: {
      connected: state.connected,
      staleMs: Number(connectionStaleMs.toFixed(1)),
    },
    control: {
      intentLane: state.runner.intentLane,
      switchLockMsLeft: Number(switchLockMsLeft.toFixed(1)),
      centerCommitMsLeft: Number(centerCommitMsLeft.toFixed(1)),
    },
    visual: {
      fxQuality: state.visual.fxQuality,
      renderMode: state.visual.renderMode,
      assetsLoaded: state.visual.assetsLoaded,
      assetTheme: state.visual.assetTheme,
      assetFallbackEnabled: visualConfig.assetFallbackEnabled,
      assetFallbackReason: state.visual.assetFallbackReason,
      trailCount: state.visual.trails.length,
      particleCount: state.visual.exhaust.length,
    },
  };
  return JSON.stringify(payload);
}

function renderGameToTextV21() {
  const now = getNow();
  const runner = state.runner;
  const connectionStaleMs = Math.max(0, now - state.lastPayloadTs);
  const switchLockMsLeft = Math.max(0, runner.switchLockUntil - now);
  const centerCommitMsLeft =
    runner.centerIntentSince > 0 ? Math.max(0, centerCommitMs - (now - runner.centerIntentSince)) : 0;
  const payload = {
    coordinateSystem: {
      origin: "top-left",
      xAxis: "right-positive",
      yAxis: "down-positive",
      unit: "pixel",
    },
    mode: runner.status,
    workoutMode: runner.workoutMode,
    laneIndex: runner.lane,
    laneLabel: ["left", "middle", "right"][runner.lane],
    score: runner.score,
    timeLeftSec: Number(runner.timeLeftSec.toFixed(2)),
    hp: runner.hp,
    maxHp: runner.maxHp,
    combo: runner.comboCount,
    comboMultiplier: runner.comboMultiplier,
    shieldActive: now <= runner.shieldUntil,
    player: {
      x: lanes[runner.lane],
      y: playerY,
    },
    obstacles: runner.obstacles.slice(0, 8).map((o) => ({
      y: Number(o.y.toFixed(1)),
      kind: o.kind || "lane_gate",
      safeLane: o.safeLane,
      checked: o.checked,
    })),
    stream: {
      connected: state.connected,
      staleMs: Number(connectionStaleMs.toFixed(1)),
    },
    control: {
      intentLane: runner.intentLane,
      switchLockMsLeft: Number(switchLockMsLeft.toFixed(1)),
      centerCommitMsLeft: Number(centerCommitMsLeft.toFixed(1)),
    },
    training: {
      intervalPhase: runner.intervalPhase,
      intervalSecLeft: Number(Math.max(0, runner.intervalSecLeft || 0).toFixed(2)),
      reactionTarget: runner.reactionTarget,
      reactionDeadlineMs: Number(Math.max(0, runner.reactionDeadlineAt - now).toFixed(1)),
      reactionHighSpeedLeftMs: Number(Math.max(0, runner.reactionHighSpeedUntil - now).toFixed(1)),
    },
    stats: {
      actionsTotal: runner.stats.actionsTotal,
      actionsCorrect: runner.stats.actionsCorrect,
      reactionHits: runner.stats.reactionHits,
      reactionAvgMs:
        runner.stats.reactionHits > 0 ? Number((runner.stats.reactionMsSum / runner.stats.reactionHits).toFixed(1)) : 0,
      fastHits: runner.stats.fastHits,
      maxCombo: runner.maxCombo,
    },
    visual: {
      fxQuality: state.visual.fxQuality,
      renderMode: state.visual.renderMode,
      assetsLoaded: state.visual.assetsLoaded,
      assetTheme: state.visual.assetTheme,
      assetFallbackEnabled: visualConfig.assetFallbackEnabled,
      assetFallbackReason: state.visual.assetFallbackReason,
      trailCount: state.visual.trails.length,
      particleCount: state.visual.exhaust.length,
    },
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToTextV21;
window.inject_pose_payload = (actions = {}, options = {}) => {
  const now = getNow();
  const staleBeforeMs = typeof options.staleBeforeMs === "number" ? options.staleBeforeMs : 0;
  const payload = {
    type: "frame",
    actions: {
      leftHandUp: Boolean(actions.leftHandUp),
      rightHandUp: Boolean(actions.rightHandUp),
      squat: Boolean(actions.squat),
    },
  };
  state.py = payload;
  onPose(payload, now, staleBeforeMs);
  state.lastPayloadTs = now;
  return renderGameToTextV21();
};
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  let now = getNow();
  for (let i = 0; i < steps; i += 1) {
    now += 1000 / 60;
    renderAt(now);
  }
  return renderGameToTextV21();
};

window.switch_workout_mode = (mode) => {
  switchWorkoutMode(mode);
  return renderGameToTextV21();
};

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
  if (event.key === "0") switchWorkoutMode(WORKOUT_MODES.CLASSIC);
  if (event.key === "1") switchWorkoutMode(WORKOUT_MODES.SPRINT_LANE);
  if (event.key === "2") switchWorkoutMode(WORKOUT_MODES.SQUAT_GATE);
  if (event.key === "3") switchWorkoutMode(WORKOUT_MODES.REACTION_DRILL);
});

btnStart.addEventListener("click", startGame);
btnPause.addEventListener("click", pauseGame);
btnResume.addEventListener("click", resumeGame);
btnRestart.addEventListener("click", restartGame);

preloadAssets();
connect();
updateControlButtons();
requestAnimationFrame(animationLoop);
