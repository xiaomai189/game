import { DEFAULT_AVATAR_SKIN, getAvatarSkinConfig, listAvatarSkins } from "../avatar/manifest.js";

const LANES = [340, 640, 940];
const TOP_LANES = [520, 640, 760];
const PLAYER_Y = 568;
const HORIZON_Y = 148;
const LANE_BLOCK_WIDTH = 170;
const LANE_BLOCK_HEIGHT = 96;
const DEPTH_FAR_Y = -LANE_BLOCK_HEIGHT;
const DEPTH_NEAR_Y = PLAYER_Y + 120;
const WORLD_SPEED_BASE = 240;
const SPEED_GAIN_CAP = 120;
const SPEED_GAIN_PER_SCORE = 1.2;
const SPAWN_MS_BASE = 1150;
const SPAWN_MS_DROP = 250;
const RUNNER_DURATION = 45;
const MAX_TIMER_CARRY_CYCLES = 30;
const ASSIST_MIN_PACE = 0.74;
const ASSIST_SMOOTHING = 0.18;
const ASSIST_SPAWN_RELIEF = 0.9;
const CENTER_COMMIT_MS = 30;
const LANE_SWITCH_LOCK_MS = 70;
const LANE_MOTION_MS = 220;
const STREAM_FREEZE_MS = 300;
const DEFAULT_VISUAL_PRESET = "sakura-lite";
const UI_VARIANT = "classic-pro-v37";

const AVATAR_FRAME_STATES = ["idle", "move_left", "move_right", "hit", "miss", "game_over"];
const FRAME_FALLBACK_CHAIN = {
  idle: ["idle", "run", "shift", "hit"],
  move_left: ["move_left", "shift", "run", "idle", "hit"],
  move_right: ["move_right", "shift", "run", "idle", "hit"],
  hit: ["hit", "miss", "run", "idle"],
  miss: ["miss", "hit", "idle", "run"],
  game_over: ["game_over", "miss", "hit", "idle"],
};
const FRAME_BLEND_MS = { idle: 120, move_left: 85, move_right: 85, hit: 60, miss: 70, game_over: 170 };

const VISUAL_PRESETS = {
  neon: {
    id: "neon",
    label: "Cyber Neon",
    bgA: "#060e2f",
    bgB: "#18123f",
    bgC: "#2b154e",
    laneGuide: "rgba(103,214,255,0.32)",
    safe: "rgba(96,244,255,0.88)",
    danger: "rgba(244,88,170,0.72)",
    focus: "rgba(72,218,255,0.24)",
    hitOverlay: "rgba(96,255,190,0.12)",
    missOverlay: "rgba(255,86,160,0.16)",
    title: "#ff8ab7",
  },
  "sakura-lite": {
    id: "sakura-lite",
    label: "Sakura Light",
    bgA: "#1a1f44",
    bgB: "#2a1f48",
    bgC: "#3b234f",
    laneGuide: "rgba(255,196,234,0.28)",
    safe: "rgba(255,224,241,0.88)",
    danger: "rgba(238,110,160,0.72)",
    focus: "rgba(255,205,236,0.22)",
    hitOverlay: "rgba(255,212,240,0.1)",
    missOverlay: "rgba(255,110,176,0.16)",
    title: "#ff9ecf",
  },
};

const PLAYER_PALETTES = {
  neon: { jacket: "#2f3b82", cloth: "#5ec0ff", hair: "#1f3069", skin: "#f6d2cf", limb: "#f8d3d7", leg: "#19233f" },
  sakura: { jacket: "#4f2a67", cloth: "#ff9fd0", hair: "#4c265f", skin: "#f7d8d2", limb: "#f9dbd8", leg: "#35214a" },
  prototype: { jacket: "#32426d", cloth: "#66d2c4", hair: "#213251", skin: "#f4d8cf", limb: "#f3d9d4", leg: "#233049" },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function laneIntentLabel(desiredLane) {
  if (desiredLane === 0) return "left";
  if (desiredLane === 1) return "center";
  if (desiredLane === 2) return "right";
  return "hold";
}

function laneLabelByIndex(index) {
  return ["left", "middle", "right"][index] || "middle";
}

function formatGameOverReason(reason) {
  if (reason === "collision") return "collision";
  return "none";
}

function randomLane() {
  return Math.floor(Math.random() * 3);
}

function listVisualPresets() {
  return Object.values(VISUAL_PRESETS).map((preset) => ({ id: preset.id, label: preset.label }));
}

function getVisualPresetConfig(presetId) {
  return VISUAL_PRESETS[presetId] ?? VISUAL_PRESETS[DEFAULT_VISUAL_PRESET];
}

function pickImageFromChain(images, frameState) {
  const chain = FRAME_FALLBACK_CHAIN[frameState] ?? [frameState, "idle"];
  for (const candidate of chain) {
    if (images[candidate]) return images[candidate];
  }
  return null;
}

function drawLimb(ctx, shoulderX, shoulderY, angle, length, color, width) {
  const elbowX = shoulderX + Math.cos(angle) * length * 0.55;
  const elbowY = shoulderY + Math.sin(angle) * length * 0.55;
  const handX = shoulderX + Math.cos(angle) * length;
  const handY = shoulderY + Math.sin(angle) * length;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
}

export function createClassicMode({ canvas, ctx, initialNow }) {
  const state = {
    status: "READY",
    lane: 1,
    intentLane: "hold",
    centerIntentSince: 0,
    switchLockUntil: 0,
    switchFxUntil: 0,
    laneMotionUntil: 0,
    laneMotionDirection: 0,
    score: 0,
    timeLeftSec: RUNNER_DURATION,
    hp: 1,
    maxHp: 1,
    comboCount: 0,
    comboMultiplier: 1,
    maxCombo: 0,
    shieldUntil: 0,
    hitFlashUntil: 0,
    missFlashUntil: 0,
    gameOverAt: 0,
    obstacles: [],
    spawnAt: initialNow + 300,
    lastStepAt: initialNow,
    poseHits: 0,
    runtimeHealthScore: 100,
    runtimeStride: 1,
    runtimeScale: 1,
    runtimeTrackingQuality: 1,
    runtimeCalibrationProgress: 1,
    runtimePaceFactor: 1,
    runtimeVisualQuality: "high",
    lastGameOverReason: "none",
    avatarSkin: DEFAULT_AVATAR_SKIN,
    avatarFrameState: "idle",
    avatarAnimationPrev: "idle",
    avatarAnimationCurrent: "idle",
    avatarAnimationStartedAt: initialNow,
    avatarAnimationBlendMs: FRAME_BLEND_MS.idle,
    avatarRenderPath: "procedural",
    assetFallbackReason: "initializing",
    avatarAssetsReady: false,
    visualPreset: DEFAULT_VISUAL_PRESET,
    lastPayloadActions: { leftHandUp: false, rightHandUp: false, squat: false },
  };
  const availableSkins = listAvatarSkins();
  const availableVisualPresets = listVisualPresets();
  const avatarAssetsCache = new Map();

  function getPreset() {
    return getVisualPresetConfig(state.visualPreset);
  }

  function setStatus(nextStatus) {
    state.status = nextStatus;
  }

  function reset(now) {
    state.status = "READY";
    state.lane = 1;
    state.intentLane = "hold";
    state.centerIntentSince = 0;
    state.switchLockUntil = 0;
    state.switchFxUntil = 0;
    state.laneMotionUntil = 0;
    state.laneMotionDirection = 0;
    state.score = 0;
    state.timeLeftSec = RUNNER_DURATION;
    state.hp = 1;
    state.maxHp = 1;
    state.comboCount = 0;
    state.comboMultiplier = 1;
    state.maxCombo = 0;
    state.shieldUntil = 0;
    state.hitFlashUntil = 0;
    state.missFlashUntil = 0;
    state.gameOverAt = 0;
    state.obstacles = [];
    state.spawnAt = now + 300;
    state.lastStepAt = now;
    state.runtimeHealthScore = 100;
    state.runtimeStride = 1;
    state.runtimeScale = 1;
    state.runtimeTrackingQuality = 1;
    state.runtimeCalibrationProgress = 1;
    state.runtimePaceFactor = 1;
    state.runtimeVisualQuality = "high";
    state.lastGameOverReason = "none";
    state.avatarFrameState = "idle";
    state.avatarAnimationPrev = "idle";
    state.avatarAnimationCurrent = "idle";
    state.avatarAnimationStartedAt = now;
    state.avatarAnimationBlendMs = FRAME_BLEND_MS.idle;
    state.avatarRenderPath = "procedural";
    state.assetFallbackReason = "runtime-reset";
  }

  function start(now) {
    reset(now);
    setStatus("RUNNING");
  }

  function pause() {
    if (state.status !== "RUNNING") return;
    setStatus("PAUSED");
  }

  function resume(now) {
    if (state.status !== "PAUSED") return;
    state.lastStepAt = now;
    setStatus("RUNNING");
  }

  function restart(now) {
    start(now);
  }

  function isImageApiAvailable() {
    return typeof Image !== "undefined";
  }

  function loadAvatarImage(src) {
    if (!src || !isImageApiAvailable()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function ensureAvatarSkinLoaded(skinId) {
    const normalizedSkin = skinId && getAvatarSkinConfig(skinId)?.id ? skinId : DEFAULT_AVATAR_SKIN;
    const existing = avatarAssetsCache.get(normalizedSkin);
    if (existing) return existing;

    const skinConfig = getAvatarSkinConfig(normalizedSkin);
    const spriteConfig = skinConfig?.sprites ?? {};
    const spritePairs = Object.entries(spriteConfig).filter(([, src]) => Boolean(src));
    if (spritePairs.length === 0) {
      const emptyEntry = {
        skinId: skinConfig.id,
        images: {},
        loadedStates: [],
        hasAnyImage: false,
        hasAllAnimationFrames: false,
        reason: "skin-without-sprites",
      };
      avatarAssetsCache.set(skinConfig.id, emptyEntry);
      return emptyEntry;
    }
    if (!isImageApiAvailable()) {
      const unavailableEntry = {
        skinId: skinConfig.id,
        images: {},
        loadedStates: [],
        hasAnyImage: false,
        hasAllAnimationFrames: false,
        reason: "image-api-unavailable",
      };
      avatarAssetsCache.set(skinConfig.id, unavailableEntry);
      return unavailableEntry;
    }

    const loadedPairs = await Promise.all(
      spritePairs.map(async ([stateName, src]) => [stateName, await loadAvatarImage(src)]),
    );
    const images = {};
    const loadedStates = [];
    for (const [stateName, img] of loadedPairs) {
      if (img) {
        images[stateName] = img;
        loadedStates.push(stateName);
      }
    }
    const hasAllAnimationFrames = AVATAR_FRAME_STATES.every((frameState) => Boolean(pickImageFromChain(images, frameState)));
    const entry = {
      skinId: skinConfig.id,
      images,
      loadedStates,
      hasAnyImage: loadedStates.length > 0,
      hasAllAnimationFrames,
      reason: loadedStates.length === 0 ? "sprite-load-failed" : hasAllAnimationFrames ? null : "partial-animation-frames",
    };
    avatarAssetsCache.set(skinConfig.id, entry);
    return entry;
  }

  function getAvatarImageForState(frameState) {
    const cacheEntry = avatarAssetsCache.get(state.avatarSkin);
    if (!cacheEntry || !cacheEntry.hasAnyImage) return null;
    return pickImageFromChain(cacheEntry.images, frameState);
  }

  function resolveAvatarFrameState(now) {
    if (state.status === "GAME_OVER") {
      if (now - state.gameOverAt < 260) return "miss";
      return "game_over";
    }
    if (now <= state.missFlashUntil) return "miss";
    if (now <= state.hitFlashUntil) return "hit";
    if (now <= state.laneMotionUntil) return state.laneMotionDirection < 0 ? "move_left" : "move_right";
    return "idle";
  }

  function updateAvatarAnimation(now) {
    const desired = resolveAvatarFrameState(now);
    if (desired !== state.avatarAnimationCurrent) {
      state.avatarAnimationPrev = state.avatarAnimationCurrent;
      state.avatarAnimationCurrent = desired;
      state.avatarAnimationStartedAt = now;
      state.avatarAnimationBlendMs = FRAME_BLEND_MS[desired] ?? 110;
    }
    const blend =
      state.avatarAnimationBlendMs <= 0
        ? 1
        : clamp((now - state.avatarAnimationStartedAt) / state.avatarAnimationBlendMs, 0, 1);
    state.avatarFrameState = state.avatarAnimationCurrent;
    return {
      frameState: state.avatarAnimationCurrent,
      previousFrameState: state.avatarAnimationPrev,
      blend,
    };
  }

  async function setAvatarSkin(skinId) {
    const selected = getAvatarSkinConfig(skinId);
    state.avatarSkin = selected.id;
    state.avatarAssetsReady = false;
    state.assetFallbackReason = "loading";
    const loaded = await ensureAvatarSkinLoaded(selected.id);
    state.avatarAssetsReady = loaded.hasAnyImage;
    state.assetFallbackReason = loaded.reason;
    return { skinId: state.avatarSkin, assetsReady: state.avatarAssetsReady, fallbackReason: state.assetFallbackReason };
  }

  function setVisualPreset(presetId) {
    state.visualPreset = getVisualPresetConfig(presetId).id;
    return { presetId: state.visualPreset };
  }

  function getVisualPreset() {
    return state.visualPreset;
  }

  function resolveDesiredLane(payload) {
    const leftUp = Boolean(payload.actions?.leftHandUp);
    const rightUp = Boolean(payload.actions?.rightHandUp);
    if (leftUp && !rightUp) return 0;
    if (!leftUp && rightUp) return 2;
    if (!leftUp && !rightUp) return 1;
    return null;
  }

  function applyLaneImmediately(desiredLane, now) {
    state.intentLane = laneIntentLabel(desiredLane);
    if (desiredLane == null) return;

    const sideLaneInput = desiredLane === 0 || desiredLane === 2;
    if (sideLaneInput && now < state.switchLockUntil && desiredLane !== state.lane) return;

    const previousLane = state.lane;
    if (sideLaneInput) {
      state.centerIntentSince = 0;
      state.lane = desiredLane;
    } else if (desiredLane === 1) {
      if (state.lane === 1) {
        state.centerIntentSince = 0;
      } else if (state.centerIntentSince === 0) {
        state.centerIntentSince = now;
      } else if (now - state.centerIntentSince >= CENTER_COMMIT_MS) {
        state.lane = 1;
        state.centerIntentSince = 0;
      }
    }

    if (state.lane !== previousLane) {
      state.laneMotionDirection = state.lane > previousLane ? 1 : -1;
      state.laneMotionUntil = now + LANE_MOTION_MS;
      state.switchFxUntil = now + 180;
      state.switchLockUntil = state.lane === 1 ? 0 : now + LANE_SWITCH_LOCK_MS;
    }
  }

  function registerMiss(now) {
    state.hp = 0;
    state.comboCount = 0;
    state.comboMultiplier = 1;
    state.missFlashUntil = now + 280;
    state.gameOverAt = now;
    state.lastGameOverReason = "collision";
    setStatus("GAME_OVER");
  }

  function registerPass(now) {
    state.score += 1;
    state.comboCount += 1;
    state.maxCombo = Math.max(state.maxCombo, state.comboCount);
    state.hitFlashUntil = now + 150;
  }

  function computePaceFactor(shared) {
    const pipeline = shared?.pipeline ?? {};
    const healthScore = clamp(Number(pipeline.healthScore ?? 100), 0, 100);
    const stride = Math.max(1, Number(pipeline.inferenceStrideFrames ?? 1));
    const scale = clamp(Number(pipeline.inferenceScale ?? 1), 0.4, 1);
    const tracking = clamp(Number(pipeline.trackingQuality ?? 1), 0, 1);
    const calibration = clamp(Number(pipeline.calibrationProgress ?? 1), 0, 1);
    state.runtimeHealthScore = healthScore;
    state.runtimeStride = stride;
    state.runtimeScale = scale;
    state.runtimeTrackingQuality = tracking;
    state.runtimeCalibrationProgress = calibration;
    state.runtimeVisualQuality = healthScore < 45 ? "low" : healthScore < 72 ? "medium" : "high";
    const targetPace = ASSIST_MIN_PACE + (healthScore / 100) * (1 - ASSIST_MIN_PACE);
    state.runtimePaceFactor = clamp(
      state.runtimePaceFactor + (targetPace - state.runtimePaceFactor) * ASSIST_SMOOTHING,
      ASSIST_MIN_PACE,
      1,
    );
    return state.runtimePaceFactor;
  }

  function getRunnerSpeed(paceFactor = 1) {
    const baseSpeed = WORLD_SPEED_BASE + Math.min(SPEED_GAIN_CAP, state.score * SPEED_GAIN_PER_SCORE);
    return baseSpeed * paceFactor;
  }

  function spawnObstacle(now, paceFactor = 1) {
    state.obstacles.push({
      kind: "lane_gate",
      y: -LANE_BLOCK_HEIGHT,
      safeLane: randomLane(),
      checked: false,
      bornAt: now,
      seed: Math.random(),
    });
    const elapsedRatio = Math.min(1, state.score / 50);
    const spawnBaseMs = SPAWN_MS_BASE - elapsedRatio * SPAWN_MS_DROP;
    const relaxedSpawnMs = spawnBaseMs * (1 + (1 - paceFactor) * ASSIST_SPAWN_RELIEF);
    state.spawnAt = now + relaxedSpawnMs;
  }

  function onPose(payload, now, staleBeforeMs = 0) {
    state.lastPayloadActions = {
      leftHandUp: Boolean(payload.actions?.leftHandUp),
      rightHandUp: Boolean(payload.actions?.rightHandUp),
      squat: Boolean(payload.actions?.squat),
    };
    state.poseHits = Number(payload.hits ?? state.poseHits ?? 0);

    if (staleBeforeMs > STREAM_FREEZE_MS) {
      state.intentLane = "hold";
      state.centerIntentSince = 0;
      return;
    }
    applyLaneImmediately(resolveDesiredLane(payload), now);
    if (state.lastPayloadActions.squat) {
      state.shieldUntil = Math.max(state.shieldUntil, now + 350);
    }
  }

  function step(now, shared = {}) {
    if (state.lastStepAt === 0) state.lastStepAt = now;
    const dt = (now - state.lastStepAt) / 1000;
    state.lastStepAt = now;
    if (state.status !== "RUNNING") return;

    state.timeLeftSec -= dt;
    if (state.timeLeftSec <= 0) {
      const carryCycles = clamp(Math.floor(Math.abs(state.timeLeftSec) / RUNNER_DURATION) + 1, 1, MAX_TIMER_CARRY_CYCLES);
      state.timeLeftSec += carryCycles * RUNNER_DURATION;
    }

    const paceFactor = computePaceFactor(shared);
    if (now >= state.spawnAt) spawnObstacle(now, paceFactor);
    const speed = getRunnerSpeed(paceFactor);
    const shieldActive = now <= state.shieldUntil;
    for (const obs of state.obstacles) {
      obs.y += speed * dt;
      if (obs.checked || obs.y < PLAYER_Y) continue;
      obs.checked = true;
      if (shieldActive || obs.safeLane === state.lane) registerPass(now);
      else registerMiss(now);
    }
    state.obstacles = state.obstacles.filter((obs) => obs.y <= canvas.height + LANE_BLOCK_HEIGHT);
  }

  function projectLanePoint(laneIndex, worldY) {
    const depth = clamp((worldY - DEPTH_FAR_Y) / (DEPTH_NEAR_Y - DEPTH_FAR_Y), 0, 1);
    const x = lerp(TOP_LANES[laneIndex], LANES[laneIndex], depth);
    const y = lerp(HORIZON_Y + 38, worldY, 0.93);
    const scale = 0.45 + depth * 0.95;
    return { x, y, depth, scale };
  }

  function drawBackground(now) {
    const preset = getPreset();
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, preset.bgA);
    grad.addColorStop(0.42, preset.bgB);
    grad.addColorStop(1, preset.bgC);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const qualityScale = state.runtimeVisualQuality === "low" ? 0.65 : state.runtimeVisualQuality === "medium" ? 0.82 : 1;
    const sparkCount = Math.round(30 * qualityScale);
    for (let i = 0; i < sparkCount; i += 1) {
      const base = (i * 73) % canvas.width;
      const drift = (now * 0.012 * ((i % 3) + 1)) % canvas.width;
      const x = (base + drift) % canvas.width;
      const y = 20 + ((i * 57) % 180);
      const size = (i % 4 === 0 ? 2.2 : 1.2) * qualityScale;
      ctx.fillStyle = "rgba(255,222,242,0.24)";
      ctx.fillRect(x, y, size, size);
    }

    const skylineY = HORIZON_Y + 12;
    for (let i = 0; i < 18; i += 1) {
      const width = 46 + (i % 5) * 20;
      const height = 54 + (i % 7) * 24;
      const shift = ((now * 0.018 * ((i % 4) + 1)) + i * 86) % (canvas.width + 120);
      const x = shift - 80;
      ctx.fillStyle = i % 2 === 0 ? "rgba(45,34,88,0.68)" : "rgba(57,33,82,0.7)";
      ctx.fillRect(x, skylineY - height, width, height);
    }

    if (preset.id === "sakura-lite") {
      const petalCount = Math.round(14 * qualityScale);
      for (let i = 0; i < petalCount; i += 1) {
        const speed = 0.04 + (i % 3) * 0.03;
        const x = ((i * 117) + now * speed) % (canvas.width + 60) - 30;
        const y = ((i * 61) + now * 0.07 * ((i % 4) + 1)) % (canvas.height + 80) - 40;
        const size = 4 + (i % 5);
        ctx.fillStyle = `rgba(255,208,231,${0.2 + (i % 4) * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 0.6, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, canvas.height);
    roadGrad.addColorStop(0, "rgba(65,41,92,0.75)");
    roadGrad.addColorStop(1, "rgba(19,16,42,0.96)");
    ctx.fillStyle = roadGrad;
    ctx.beginPath();
    ctx.moveTo(TOP_LANES[0] - 170, HORIZON_Y + 26);
    ctx.lineTo(TOP_LANES[2] + 170, HORIZON_Y + 26);
    ctx.lineTo(LANES[2] + 250, canvas.height + 8);
    ctx.lineTo(LANES[0] - 250, canvas.height + 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = preset.laneGuide;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(TOP_LANES[i], HORIZON_Y + 24);
      ctx.lineTo(LANES[i], canvas.height);
      ctx.stroke();
    }
  }

  function drawLaneFocus() {
    const preset = getPreset();
    const laneX = LANES[state.lane];
    ctx.fillStyle = preset.focus;
    ctx.beginPath();
    ctx.moveTo(laneX - 72, PLAYER_Y + 72);
    ctx.lineTo(laneX + 72, PLAYER_Y + 72);
    ctx.lineTo(laneX + 106, canvas.height - 3);
    ctx.lineTo(laneX - 106, canvas.height - 3);
    ctx.closePath();
    ctx.fill();
  }

  function drawObstacleBlock(x, y, w, h, safeLane, depth, seed) {
    const preset = getPreset();
    if (safeLane) {
      ctx.strokeStyle = preset.safe;
      ctx.lineWidth = Math.max(2, 2 + depth * 3);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,220,241,0.16)";
      ctx.fillRect(x + w * 0.09, y + h * 0.09, w * 0.82, h * 0.82);
    } else {
      const pulse = 0.78 + Math.sin(seed * 40 + y * 0.02) * 0.06;
      ctx.fillStyle = preset.danger;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,188,218,0.24)";
      ctx.fillRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84 * pulse);
    }
  }

  function drawObstacles() {
    const sorted = [...state.obstacles].sort((a, b) => a.y - b.y);
    for (const obs of sorted) {
      for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
        const projected = projectLanePoint(laneIndex, obs.y);
        const w = LANE_BLOCK_WIDTH * projected.scale;
        const h = LANE_BLOCK_HEIGHT * projected.scale;
        drawObstacleBlock(projected.x - w / 2, projected.y - h / 2, w, h, laneIndex === obs.safeLane, projected.depth, obs.seed);
      }
    }
  }

  function createPose(frameState, runPhase, now) {
    const gait = Math.sin(runPhase);
    const pose = {
      xOffset: 0,
      yOffset: Math.sin(runPhase) * 5 + Math.sin(runPhase * 0.5) * 2.2,
      tilt: (state.lane - 1) * 0.03,
      scale: 1,
      shadowScale: 1,
      leftArm: -2.55 + gait * 0.15,
      rightArm: -0.55 - gait * 0.15,
      leftLeg: Math.PI * 0.56 + gait * 0.16,
      rightLeg: Math.PI * 0.64 - gait * 0.16,
      trailAlpha: 0,
      flashAlpha: 0,
    };
    if (frameState === "move_left") {
      pose.xOffset = -16;
      pose.tilt = -0.18;
      pose.scale = 1.03;
      pose.trailAlpha = 0.2;
    } else if (frameState === "move_right") {
      pose.xOffset = 16;
      pose.tilt = 0.18;
      pose.scale = 1.03;
      pose.trailAlpha = 0.2;
    } else if (frameState === "hit") {
      pose.yOffset += 4;
      pose.scale = 0.92;
      pose.flashAlpha = 0.35 + Math.sin(now * 0.01) * 0.15;
    } else if (frameState === "miss") {
      pose.yOffset += 10;
      pose.scale = 0.86;
      pose.tilt = (state.lane - 1) * -0.08;
      pose.flashAlpha = 0.3;
    } else if (frameState === "game_over") {
      pose.yOffset += 14;
      pose.scale = 0.82;
      pose.tilt = (state.lane - 1) * -0.1;
      pose.flashAlpha = 0.22;
    }
    return pose;
  }

  function blendPose(fromPose, toPose, t) {
    return {
      xOffset: lerp(fromPose.xOffset, toPose.xOffset, t),
      yOffset: lerp(fromPose.yOffset, toPose.yOffset, t),
      tilt: lerp(fromPose.tilt, toPose.tilt, t),
      scale: lerp(fromPose.scale, toPose.scale, t),
      shadowScale: lerp(fromPose.shadowScale, toPose.shadowScale, t),
      leftArm: lerp(fromPose.leftArm, toPose.leftArm, t),
      rightArm: lerp(fromPose.rightArm, toPose.rightArm, t),
      leftLeg: lerp(fromPose.leftLeg, toPose.leftLeg, t),
      rightLeg: lerp(fromPose.rightLeg, toPose.rightLeg, t),
      trailAlpha: lerp(fromPose.trailAlpha, toPose.trailAlpha, t),
      flashAlpha: lerp(fromPose.flashAlpha, toPose.flashAlpha, t),
    };
  }

  function drawPlayerProcedural(now, pose, frameState) {
    const palette = PLAYER_PALETTES[state.avatarSkin] ?? PLAYER_PALETTES.neon;
    const x = LANES[state.lane] + pose.xOffset;
    const shield = now <= state.shieldUntil;
    const leftArmUp = state.lastPayloadActions.leftHandUp && frameState !== "game_over";
    const rightArmUp = state.lastPayloadActions.rightHandUp && frameState !== "game_over";

    ctx.fillStyle = "rgba(27,20,60,0.48)";
    ctx.beginPath();
    ctx.ellipse(x, PLAYER_Y + 38, 84 * pose.shadowScale, 18 * pose.shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, PLAYER_Y + pose.yOffset);
    ctx.rotate(pose.tilt);
    ctx.scale(pose.scale, pose.scale);
    ctx.fillStyle = palette.jacket;
    ctx.beginPath();
    ctx.moveTo(-25, -8);
    ctx.lineTo(25, -8);
    ctx.lineTo(30, 48);
    ctx.lineTo(-30, 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shield ? "#78ffd2" : palette.cloth;
    ctx.fillRect(-12, -2, 24, 35);
    drawLimb(ctx, -22, 2, leftArmUp ? -2.1 : pose.leftArm, 40, palette.limb, 8);
    drawLimb(ctx, 22, 2, rightArmUp ? -1.02 : pose.rightArm, 40, palette.limb, 8);
    drawLimb(ctx, -10, 48, pose.leftLeg, 37, palette.leg, 9);
    drawLimb(ctx, 10, 48, pose.rightLeg, 37, palette.leg, 9);
    ctx.fillStyle = palette.skin;
    ctx.beginPath();
    ctx.arc(0, -36, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.hair;
    ctx.beginPath();
    ctx.moveTo(-24, -42);
    ctx.quadraticCurveTo(-8, -72, 24, -52);
    ctx.lineTo(22, -34);
    ctx.quadraticCurveTo(0, -50, -22, -34);
    ctx.closePath();
    ctx.fill();
    if (pose.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,186,223,${pose.flashAlpha.toFixed(3)})`;
      ctx.fillRect(-66, -90, 132, 162);
    }
    ctx.restore();

    if (shield) {
      ctx.strokeStyle = "rgba(120,255,180,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, PLAYER_Y + pose.yOffset - 2, 44, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayerSprite(now, pose, frameState) {
    const sprite = getAvatarImageForState(frameState);
    if (!sprite) return false;
    const x = LANES[state.lane] + pose.xOffset;
    const shield = now <= state.shieldUntil;
    const drawWidth = 196 * pose.scale;
    const drawHeight = 196 * pose.scale;

    ctx.fillStyle = "rgba(27,20,60,0.44)";
    ctx.beginPath();
    ctx.ellipse(x, PLAYER_Y + 38, 84 * pose.shadowScale, 18 * pose.shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pose.trailAlpha > 0 && state.runtimeVisualQuality !== "low") {
      ctx.save();
      ctx.globalAlpha = pose.trailAlpha;
      ctx.translate(x - state.laneMotionDirection * 20, PLAYER_Y + pose.yOffset + 1);
      ctx.rotate(pose.tilt * 0.65);
      ctx.drawImage(sprite, -drawWidth / 2, -drawHeight * 0.73, drawWidth, drawHeight);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, PLAYER_Y + pose.yOffset - 4);
    ctx.rotate(pose.tilt);
    ctx.drawImage(sprite, -drawWidth / 2, -drawHeight * 0.73, drawWidth, drawHeight);
    if (pose.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,120,172,${pose.flashAlpha.toFixed(3)})`;
      ctx.fillRect(-66, -90, 132, 162);
    }
    ctx.restore();

    if (shield) {
      ctx.strokeStyle = "rgba(120,255,180,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, PLAYER_Y + pose.yOffset - 2, 44, 0, Math.PI * 2);
      ctx.stroke();
    }
    return true;
  }

  function drawSwitchFx(now, pose) {
    if (now > state.switchFxUntil) return;
    const t = clamp((state.switchFxUntil - now) / 180, 0, 1);
    const x = LANES[state.lane] + pose.xOffset;
    ctx.strokeStyle = `rgba(255,212,240,${(0.56 * t).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, PLAYER_Y + pose.yOffset - 3, 46 + (1 - t) * 24, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPlayer(now) {
    const animation = updateAvatarAnimation(now);
    const runPhase = now / (state.runtimePaceFactor < 0.9 ? 130 : 92);
    const targetPose = createPose(animation.frameState, runPhase, now);
    const previousPose = createPose(animation.previousFrameState, runPhase - 0.35, now);
    const pose = blendPose(previousPose, targetPose, easeOutCubic(animation.blend));
    const usedSprite = drawPlayerSprite(now, pose, animation.frameState);
    state.avatarRenderPath = usedSprite ? "sprite" : "procedural";
    if (!usedSprite) {
      const cacheEntry = avatarAssetsCache.get(state.avatarSkin);
      state.assetFallbackReason = cacheEntry?.reason ?? "sprite-not-ready";
      drawPlayerProcedural(now, pose, animation.frameState);
    } else {
      const cacheEntry = avatarAssetsCache.get(state.avatarSkin);
      state.assetFallbackReason = cacheEntry?.images?.[animation.frameState] ? null : `frame-fallback:${animation.frameState}`;
    }
    drawSwitchFx(now, pose);
  }

  function drawOverlay(now, shared = {}) {
    const preset = getPreset();
    if (shared.staleMs > 1300) {
      ctx.fillStyle = "rgba(255,215,110,0.2)";
      ctx.fillRect(24, 24, 420, 44);
      ctx.fillStyle = "#ffe8a1";
      ctx.font = "700 22px Trebuchet MS";
      ctx.fillText("Waiting pose stream...", 36, 54);
    }
    if (now <= state.hitFlashUntil) {
      ctx.fillStyle = preset.hitOverlay;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (now <= state.missFlashUntil) {
      ctx.fillStyle = preset.missOverlay;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (state.status === "READY") {
      ctx.fillStyle = "rgba(8,10,22,0.42)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffd8f0";
      ctx.font = "800 40px Trebuchet MS";
      ctx.fillText("Press Start to begin", canvas.width / 2 - 178, 312);
    } else if (state.status === "PAUSED") {
      ctx.fillStyle = "rgba(10,10,24,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffe3aa";
      ctx.font = "800 64px Trebuchet MS";
      ctx.fillText("PAUSED", canvas.width / 2 - 126, 320);
    } else if (state.status === "GAME_OVER") {
      ctx.fillStyle = "rgba(8,10,24,0.68)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = preset.title;
      ctx.font = "900 62px Trebuchet MS";
      ctx.fillText("SESSION COMPLETE", canvas.width / 2 - 280, 275);
      ctx.fillStyle = "#fff0fb";
      ctx.font = "700 28px Trebuchet MS";
      ctx.fillText(`Score ${state.score}`, canvas.width / 2 - 80, 326);
      ctx.fillStyle = "#ffd8eb";
      ctx.font = "700 22px Trebuchet MS";
      ctx.fillText(`Reason: ${formatGameOverReason(state.lastGameOverReason)}`, canvas.width / 2 - 106, 362);
      ctx.fillStyle = "#fff0fb";
      ctx.font = "600 20px Trebuchet MS";
      ctx.fillText("Press Enter/Space or R to restart", canvas.width / 2 - 165, 396);
    }
  }

  function render(now, shared) {
    drawBackground(now);
    drawLaneFocus();
    drawObstacles();
    drawPlayer(now);
    drawOverlay(now, shared);
  }

  function getHud(now) {
    const assistTag = state.runtimePaceFactor < 0.9 ? ` | Assist ${Math.round((1 - state.runtimePaceFactor) * 100)}%` : "";
    const healthScore = Number(state.runtimeHealthScore.toFixed(0));
    const pacePct = Number((state.runtimePaceFactor * 100).toFixed(0));
    const progressPct = Number(clamp(((RUNNER_DURATION - state.timeLeftSec) / RUNNER_DURATION) * 100, 0, 100).toFixed(1));
    const riskScore = Number(
      clamp((100 - state.runtimeHealthScore) * 0.65 + (1 - state.runtimePaceFactor) * 100 * 0.35, 0, 100).toFixed(0),
    );
    const riskLevel = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
    const roundHint =
      state.status === "READY"
        ? "Round hint: Press Start or Enter/Space to begin."
        : state.status === "PAUSED"
          ? "Round hint: Paused. Press P or Enter/Space to continue."
          : state.status === "GAME_OVER"
            ? `Round hint: Ended by ${formatGameOverReason(state.lastGameOverReason)}. Press Enter/Space or R for next run.`
            : riskLevel === "high"
              ? "Round hint: High risk. Keep stable lane control and use squat shield on dense gates."
              : "Round hint: Keep rhythm and pass safe lanes for score.";
    return {
      statusText: `Status: ${state.status} | Classic${assistTag}`,
      timeText: `Time: ${Math.max(0, state.timeLeftSec).toFixed(1)}s`,
      scoreText: `Score: ${state.score}`,
      hitsText: `Pose Hits: ${state.poseHits}`,
      laneText: `Lane: ${laneLabelByIndex(state.lane).replace(/^./, (s) => s.toUpperCase())}`,
      hp: state.hp,
      maxHp: state.maxHp,
      now,
      visualPreset: state.visualPreset,
      healthScore,
      pacePct,
      riskScore,
      riskLevel,
      progressPct,
      roundHint,
      gameOverReason: state.lastGameOverReason,
    };
  }

  function renderToText(now, shared) {
    const switchLockMsLeft = Math.max(0, state.switchLockUntil - now);
    const centerCommitMsLeft = state.centerIntentSince > 0 ? Math.max(0, CENTER_COMMIT_MS - (now - state.centerIntentSince)) : 0;
    const blend = clamp((now - state.avatarAnimationStartedAt) / Math.max(1, state.avatarAnimationBlendMs), 0, 1);
    return JSON.stringify({
      coordinateSystem: { origin: "top-left", xAxis: "right-positive", yAxis: "down-positive", unit: "pixel" },
      mode: state.status,
      workoutMode: "classic",
      laneIndex: state.lane,
      laneLabel: laneLabelByIndex(state.lane),
      score: state.score,
      timeLeftSec: Number(Math.max(0, state.timeLeftSec).toFixed(2)),
      hp: state.hp,
      maxHp: state.maxHp,
      combo: state.comboCount,
      comboMultiplier: state.comboMultiplier,
      shieldActive: now <= state.shieldUntil,
      player: { x: LANES[state.lane], y: PLAYER_Y },
      obstacles: state.obstacles.slice(0, 8).map((o) => ({ y: Number(o.y.toFixed(1)), kind: "lane_gate", safeLane: o.safeLane, checked: o.checked })),
      stream: { connected: Boolean(shared.connected), staleMs: Number(Math.max(0, shared.staleMs).toFixed(1)) },
      runtime: {
        healthScore: Number(state.runtimeHealthScore.toFixed(2)),
        paceFactor: Number(state.runtimePaceFactor.toFixed(3)),
        inferenceStrideFrames: Number(state.runtimeStride.toFixed(2)),
        inferenceScale: Number(state.runtimeScale.toFixed(3)),
        trackingQuality: Number(state.runtimeTrackingQuality.toFixed(3)),
        calibrationProgress: Number(state.runtimeCalibrationProgress.toFixed(3)),
      },
      control: { intentLane: state.intentLane, switchLockMsLeft: Number(switchLockMsLeft.toFixed(1)), centerCommitMsLeft: Number(centerCommitMsLeft.toFixed(1)) },
      training: { intervalPhase: "sprint", intervalSecLeft: 20, reactionTarget: null, reactionDeadlineMs: 0, reactionHighSpeedLeftMs: 0 },
      stats: { actionsTotal: 0, actionsCorrect: 0, reactionHits: 0, reactionAvgMs: 0, fastHits: 0, maxCombo: state.maxCombo },
      round: {
        gameOverReason: state.lastGameOverReason,
        progressPct: Number(clamp(((RUNNER_DURATION - state.timeLeftSec) / RUNNER_DURATION) * 100, 0, 100).toFixed(1)),
        riskLevel:
          state.runtimeHealthScore < 45 || state.runtimePaceFactor < 0.82
            ? "high"
            : state.runtimeHealthScore < 72 || state.runtimePaceFactor < 0.92
              ? "medium"
              : "low",
      },
      visual: {
        uiVariant: UI_VARIANT,
        inputMode: shared?.inputMode?.effective ?? "unknown",
        fxQuality: state.runtimeVisualQuality,
        renderMode: "mode-isolated-2.5d",
        assetsLoaded: state.avatarAssetsReady,
        assetTheme: state.avatarSkin === "sakura" ? "anime-sakura-2.5d" : state.avatarSkin === "prototype" ? "anime-fallback-2.5d" : "anime-neon-2.5d",
        avatarStyle: "anime-runner",
        avatarSkin: state.avatarSkin,
        avatarFrameState: state.avatarFrameState,
        avatarAnimationBlend: Number(blend.toFixed(3)),
        avatarRenderPath: state.avatarRenderPath,
        visualPreset: state.visualPreset,
        depthProjection: true,
        assetFallbackEnabled: true,
        assetFallbackReason: state.assetFallbackReason,
        trailCount: Number((state.obstacles.length * 0.6).toFixed(0)),
        particleCount: Number(state.runtimeVisualQuality === "low" ? 12 : state.runtimeVisualQuality === "medium" ? 20 : 30),
      },
    });
  }

  function getStatus() {
    return state.status;
  }

  function getAvailableSkins() {
    return availableSkins;
  }

  function getAvatarSkin() {
    return state.avatarSkin;
  }

  function getAvailableVisualPresets() {
    return availableVisualPresets;
  }

  function dispose() {}

  void setAvatarSkin(DEFAULT_AVATAR_SKIN);

  return {
    start,
    pause,
    resume,
    restart,
    onPose,
    step,
    render,
    renderToText,
    getStatus,
    getHud,
    setAvatarSkin,
    getAvailableSkins,
    getAvatarSkin,
    setVisualPreset,
    getVisualPreset,
    getAvailableVisualPresets,
    dispose,
  };
}
