import { DEFAULT_AVATAR_SKIN, getAvatarSkinConfig, listAvatarSkins } from "../avatar/manifest.js";

const ROUND_DURATION_SEC = 45;
const PLAYER_Y = 560;
const OBSTACLE_WIDTH = 140;
const OBSTACLE_HEIGHT = 84;
const OBSTACLE_SPEED = 255;
const SPAWN_INTERVAL_MS = 1150;
const CENTER_COMMIT_MS = 30;
const TRACK_FAR_Y = -OBSTACLE_HEIGHT;
const TRACK_NEAR_Y = PLAYER_Y + 110;
const UI_VARIANT = "dual-race-v42";

const VISUAL_PRESETS = {
  "sakura-lite": {
    id: "sakura-lite",
    label: "Sakura Light",
    bgA: "#1c1f45",
    bgB: "#32224e",
    bgC: "#271f43",
    lane: "rgba(255, 210, 236, 0.32)",
    safe: "rgba(244, 255, 250, 0.92)",
    danger: "rgba(238, 111, 161, 0.74)",
    split: "rgba(255, 220, 242, 0.8)",
    text: "#fff2fb",
  },
  neon: {
    id: "neon",
    label: "Cyber Neon",
    bgA: "#101536",
    bgB: "#1c1b47",
    bgC: "#132846",
    lane: "rgba(121, 214, 255, 0.28)",
    safe: "rgba(142, 255, 244, 0.92)",
    danger: "rgba(245, 99, 166, 0.72)",
    split: "rgba(180, 214, 255, 0.75)",
    text: "#f2f8ff",
  },
};

const PLAYER_PALETTES = {
  neon: { body: "#2e5cb4", core: "#5ed6ff", head: "#f3d7d2", trim: "#1d2b5e" },
  sakura: { body: "#634483", core: "#ff9fd0", head: "#f5d8d1", trim: "#3b2452" },
  prototype: { body: "#4560a1", core: "#7edbd0", head: "#efd8cc", trim: "#263659" },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function laneLabelByIndex(index) {
  return ["left", "middle", "right"][index] ?? "middle";
}

function normalizeActions(actions = {}) {
  return {
    leftHandUp: Boolean(actions.leftHandUp),
    rightHandUp: Boolean(actions.rightHandUp),
    squat: Boolean(actions.squat),
  };
}

function normalizePipeline(pipeline = {}) {
  const getNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    healthScore: getNumber(pipeline.healthScore, 100),
    inferenceStrideFrames: getNumber(pipeline.inferenceStrideFrames, 1),
    inferenceScale: getNumber(pipeline.inferenceScale, 1),
    trackingQuality: getNumber(pipeline.trackingQuality, 1),
    calibrationProgress: getNumber(pipeline.calibrationProgress, 1),
  };
}

function resolveDesiredLane(actions) {
  const left = Boolean(actions?.leftHandUp);
  const right = Boolean(actions?.rightHandUp);
  if (left && !right) return 0;
  if (!left && right) return 2;
  if (!left && !right) return 1;
  return null;
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function createPlayer(cameraId) {
  return {
    cameraId,
    connected: false,
    alive: true,
    score: 0,
    lane: 1,
    intentLane: "hold",
    centerIntentSince: 0,
    lastPoseAt: 0,
    staleMs: 9999,
    poseHits: 0,
    lastActions: normalizeActions(),
    pipeline: normalizePipeline(),
    eliminatedAt: 0,
  };
}

export function createDualRaceMode({ canvas, ctx, initialNow }) {
  const availableSkins = listAvatarSkins();
  const availablePresets = Object.values(VISUAL_PRESETS).map((preset) => ({ id: preset.id, label: preset.label }));

  const state = {
    status: "READY",
    roundDurationSec: ROUND_DURATION_SEC,
    roundEndAt: initialNow + ROUND_DURATION_SEC * 1000,
    pausedRemainingMs: ROUND_DURATION_SEC * 1000,
    winner: null,
    avatarSkin: DEFAULT_AVATAR_SKIN,
    visualPreset: "sakura-lite",
    lastStepAt: initialNow,
    nextObstacleId: 1,
    spawnAt: initialNow + 500,
    obstacles: [],
    rng: lcg(Math.floor(initialNow) ^ 0x9e3779b9),
    players: {
      p1: createPlayer(0),
      p2: createPlayer(1),
    },
  };

  function getPreset() {
    return VISUAL_PRESETS[state.visualPreset] ?? VISUAL_PRESETS["sakura-lite"];
  }

  function resetRound(now) {
    state.status = "READY";
    state.roundEndAt = now + state.roundDurationSec * 1000;
    state.pausedRemainingMs = state.roundDurationSec * 1000;
    state.winner = null;
    state.lastStepAt = now;
    state.nextObstacleId = 1;
    state.spawnAt = now + 500;
    state.obstacles = [];
    state.rng = lcg((Math.floor(now) ^ 0x9e3779b9) >>> 0);
    state.players.p1 = createPlayer(0);
    state.players.p2 = createPlayer(1);
  }

  function start(now) {
    resetRound(now);
    state.status = "RUNNING";
  }

  function pause(now) {
    if (state.status !== "RUNNING") return;
    state.status = "PAUSED";
    state.pausedRemainingMs = Math.max(0, state.roundEndAt - now);
  }

  function resume(now) {
    if (state.status !== "PAUSED") return;
    state.status = "RUNNING";
    state.roundEndAt = now + state.pausedRemainingMs;
    state.lastStepAt = now;
  }

  function restart(now) {
    start(now);
  }

  function setPlayerLane(player, desiredLane, now) {
    if (desiredLane == null || !player.alive) return;
    player.intentLane = desiredLane === 0 ? "left" : desiredLane === 2 ? "right" : "center";
    if (desiredLane === 1) {
      if (player.lane === 1) {
        player.centerIntentSince = 0;
        return;
      }
      if (player.centerIntentSince <= 0) {
        player.centerIntentSince = now;
        return;
      }
      if (now - player.centerIntentSince >= CENTER_COMMIT_MS) {
        player.lane = 1;
        player.centerIntentSince = 0;
      }
      return;
    }
    player.centerIntentSince = 0;
    player.lane = desiredLane;
  }

  function findCameraFrame(payload, cameraId) {
    const cameras = Array.isArray(payload?.cameras) ? payload.cameras : [];
    return cameras.find((item) => Number(item?.cameraId) === cameraId) ?? null;
  }

  function applyPlayerPose(player, cameraFrame, now) {
    if (!cameraFrame) {
      player.connected = false;
      player.staleMs = 9999;
      return;
    }
    player.connected = Boolean(cameraFrame.connected);
    player.lastActions = normalizeActions(cameraFrame.actions ?? {});
    player.pipeline = normalizePipeline(cameraFrame.pipeline ?? {});
    player.poseHits = Number(cameraFrame.hits ?? player.poseHits ?? 0);
    if (player.connected) {
      player.lastPoseAt = now;
      setPlayerLane(player, resolveDesiredLane(player.lastActions), now);
    }
  }

  function onPose(payload, now) {
    applyPlayerPose(state.players.p1, findCameraFrame(payload, 0), now);
    applyPlayerPose(state.players.p2, findCameraFrame(payload, 1), now);
  }

  function spawnObstacle(now) {
    const safeLane = Math.floor(state.rng() * 3);
    state.obstacles.push({
      id: state.nextObstacleId++,
      y: TRACK_FAR_Y,
      safeLane,
      checked: false,
      bornAt: now,
    });
    state.spawnAt = now + SPAWN_INTERVAL_MS;
  }

  function handleObstaclePass(now) {
    for (const obstacle of state.obstacles) {
      if (obstacle.checked || obstacle.y < PLAYER_Y) continue;
      obstacle.checked = true;
      for (const key of ["p1", "p2"]) {
        const player = state.players[key];
        if (!player.alive || !player.connected) continue;
        if (player.lane === obstacle.safeLane) player.score += 1;
        else {
          player.alive = false;
          player.eliminatedAt = now;
        }
      }
    }
  }

  function updateWinner() {
    const p1Score = state.players.p1.score;
    const p2Score = state.players.p2.score;
    if (p1Score > p2Score) state.winner = "p1";
    else if (p2Score > p1Score) state.winner = "p2";
    else state.winner = "draw";
  }

  function step(now) {
    for (const key of ["p1", "p2"]) {
      const player = state.players[key];
      player.staleMs = player.lastPoseAt <= 0 ? 9999 : Math.max(0, now - player.lastPoseAt);
    }
    if (state.status !== "RUNNING") return;
    const dt = Math.max(0, (now - state.lastStepAt) / 1000);
    state.lastStepAt = now;

    if (now >= state.roundEndAt) {
      state.status = "GAME_OVER";
      updateWinner();
      return;
    }

    if (now >= state.spawnAt) spawnObstacle(now);
    for (const obstacle of state.obstacles) obstacle.y += OBSTACLE_SPEED * dt;
    handleObstaclePass(now);
    state.obstacles = state.obstacles.filter((item) => item.y <= canvas.height + OBSTACLE_HEIGHT + 20);
  }

  function laneProjection(width) {
    return {
      near: [width * 0.22, width * 0.5, width * 0.78],
      far: [width * 0.38, width * 0.5, width * 0.62],
    };
  }

  function projectPoint(track, laneIndex, worldY) {
    const depth = clamp((worldY - TRACK_FAR_Y) / (TRACK_NEAR_Y - TRACK_FAR_Y), 0, 1);
    const x = track.far[laneIndex] + (track.near[laneIndex] - track.far[laneIndex]) * depth;
    const y = 140 + (worldY - 140) * 0.96;
    const scale = 0.48 + depth * 0.92;
    return { x, y, scale };
  }

  function drawPlayer(surfaceX, width, player, label) {
    const preset = getPreset();
    const track = laneProjection(width);
    const laneX = track.near[player.lane];
    const palette = PLAYER_PALETTES[state.avatarSkin] ?? PLAYER_PALETTES.neon;

    ctx.save();
    ctx.translate(surfaceX, 0);

    const bg = ctx.createLinearGradient(0, 0, width, canvas.height);
    bg.addColorStop(0, preset.bgA);
    bg.addColorStop(0.5, preset.bgB);
    bg.addColorStop(1, preset.bgC);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, canvas.height);

    ctx.strokeStyle = preset.lane;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(track.far[i], 154);
      ctx.lineTo(track.near[i], canvas.height);
      ctx.stroke();
    }

    for (const obstacle of state.obstacles) {
      for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
        const p = projectPoint(track, laneIndex, obstacle.y);
        const w = OBSTACLE_WIDTH * p.scale;
        const h = OBSTACLE_HEIGHT * p.scale;
        const x = p.x - w / 2;
        const y = p.y - h / 2;
        if (laneIndex === obstacle.safeLane) {
          ctx.strokeStyle = preset.safe;
          ctx.lineWidth = Math.max(2, 2 + p.scale * 2);
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = "rgba(255,255,255,0.09)";
          ctx.fillRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84);
        } else {
          ctx.fillStyle = preset.danger;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "rgba(255, 214, 237, 0.18)";
          ctx.fillRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84);
        }
      }
    }

    ctx.fillStyle = "rgba(19, 14, 39, 0.42)";
    ctx.beginPath();
    ctx.ellipse(laneX, PLAYER_Y + 36, 66, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.body;
    ctx.fillRect(laneX - 24, PLAYER_Y - 20, 48, 78);
    ctx.fillStyle = palette.core;
    ctx.fillRect(laneX - 10, PLAYER_Y - 8, 20, 56);
    ctx.fillStyle = palette.trim;
    ctx.fillRect(laneX - 30, PLAYER_Y + 56, 16, 22);
    ctx.fillRect(laneX + 14, PLAYER_Y + 56, 16, 22);
    ctx.fillStyle = palette.head;
    ctx.beginPath();
    ctx.arc(laneX, PLAYER_Y - 42, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(17, 12, 36, 0.72)";
    ctx.fillRect(12, 14, 196, 40);
    ctx.fillStyle = preset.text;
    ctx.font = "700 34px Trebuchet MS";
    ctx.fillText(label, 24, 42);

    if (!player.connected) {
      ctx.fillStyle = "rgba(255, 215, 145, 0.2)";
      ctx.fillRect(16, 70, 220, 36);
      ctx.fillStyle = "#ffe6b5";
      ctx.font = "700 22px Trebuchet MS";
      ctx.fillText("Waiting pose stream...", 24, 96);
    } else if (!player.alive) {
      ctx.fillStyle = "rgba(255, 112, 176, 0.22)";
      ctx.fillRect(16, 70, 220, 36);
      ctx.fillStyle = "#ffc7df";
      ctx.font = "700 22px Trebuchet MS";
      ctx.fillText("Eliminated", 24, 96);
    }

    ctx.restore();
  }

  function drawGlobalOverlay() {
    const preset = getPreset();
    if (state.status !== "GAME_OVER") return;
    const winnerText = state.winner === "draw" ? "DRAW" : state.winner === "p1" ? "P1 WINS" : "P2 WINS";
    ctx.fillStyle = "rgba(10, 8, 28, 0.68)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = preset.text;
    ctx.font = "900 66px Trebuchet MS";
    const ww = ctx.measureText(winnerText).width;
    ctx.fillText(winnerText, (canvas.width - ww) / 2, canvas.height / 2 - 14);
    ctx.fillStyle = "#ffe4f5";
    ctx.font = "600 26px Trebuchet MS";
    const tip = "Press Restart for next race";
    const tw = ctx.measureText(tip).width;
    ctx.fillText(tip, (canvas.width - tw) / 2, canvas.height / 2 + 30);
  }

  function render() {
    const half = canvas.width / 2;
    drawPlayer(0, half, state.players.p1, "P1  Camera 0");
    drawPlayer(half, half, state.players.p2, "P2  Camera 1");
    const preset = getPreset();
    ctx.fillStyle = preset.split;
    ctx.fillRect(half - 1, 0, 2, canvas.height);
    drawGlobalOverlay();
  }

  function getHud(now) {
    const p1 = state.players.p1;
    const p2 = state.players.p2;
    const left = Math.max(0, (state.roundEndAt - now) / 1000);
    const health = (p1.pipeline.healthScore + p2.pipeline.healthScore) / 2;
    const pace = ((p1.pipeline.trackingQuality + p2.pipeline.trackingQuality) / 2) * 100;
    const lead = p1.score === p2.score ? "Lead: Draw" : p1.score > p2.score ? `Lead: P1 +${p1.score - p2.score}` : `Lead: P2 +${p2.score - p1.score}`;
    const roundHint =
      state.status === "GAME_OVER"
        ? state.winner === "draw"
          ? "Round hint: draw. Both players tied this race."
          : `Round hint: ${state.winner === "p1" ? "P1" : "P2"} wins. Press Restart for next race.`
        : `Round hint: P1(${p1.connected ? "online" : "offline"}) vs P2(${p2.connected ? "online" : "offline"}). Keep the safe lane and race the clock.`;
    return {
      statusText: `Status: ${state.status} | Dual Race`,
      timeText: `Time: ${left.toFixed(1)}s`,
      scoreText: `P1 Score: ${p1.score}${p1.alive ? "" : " (OUT)"}`,
      hitsText: `P2 Score: ${p2.score}${p2.alive ? "" : " (OUT)"}`,
      laneText: lead,
      healthScore: clamp(health, 0, 100),
      pacePct: clamp(pace, 0, 100),
      progressPct: clamp(((state.roundDurationSec - left) / state.roundDurationSec) * 100, 0, 100),
      riskLevel: !p1.connected || !p2.connected ? "high" : !p1.alive || !p2.alive ? "medium" : "low",
      roundHint,
      objectiveText: "Objective: shared obstacle map race. Higher score wins when timer ends.",
      legendText: "Rule: P1=cam0, P2=cam1. Wrong lane eliminates that player; round continues to timeout.",
    };
  }

  function renderToText(now) {
    const p1 = state.players.p1;
    const p2 = state.players.p2;
    const nextObstacle = state.obstacles.find((item) => !item.checked) ?? null;
    return JSON.stringify({
      coordinateSystem: { origin: "top-left", xAxis: "right-positive", yAxis: "down-positive", unit: "pixel" },
      mode: state.status,
      workoutMode: "dual_race",
      timeLeftSec: Number(Math.max(0, (state.roundEndAt - now) / 1000).toFixed(2)),
      winner: state.winner,
      score: Math.max(p1.score, p2.score),
      laneLabel: p1.score === p2.score ? "draw" : p1.score > p2.score ? "p1_lead" : "p2_lead",
      players: {
        p1: {
          cameraId: p1.cameraId,
          connected: p1.connected,
          alive: p1.alive,
          score: p1.score,
          laneLabel: laneLabelByIndex(p1.lane),
          staleMs: Number(p1.staleMs.toFixed(1)),
          status: p1.alive ? "RUNNING" : "ELIMINATED",
        },
        p2: {
          cameraId: p2.cameraId,
          connected: p2.connected,
          alive: p2.alive,
          score: p2.score,
          laneLabel: laneLabelByIndex(p2.lane),
          staleMs: Number(p2.staleMs.toFixed(1)),
          status: p2.alive ? "RUNNING" : "ELIMINATED",
        },
      },
      stream: {
        connected: Boolean(p1.connected || p2.connected),
        staleMs: Number(Math.max(p1.staleMs, p2.staleMs).toFixed(1)),
      },
      track: {
        obstacleCount: state.obstacles.length,
        nextSafeLane: nextObstacle ? nextObstacle.safeLane : null,
      },
      visual: {
        uiVariant: UI_VARIANT,
        renderMode: "split-screen",
      },
    });
  }

  async function setAvatarSkin(skinId) {
    state.avatarSkin = getAvatarSkinConfig(skinId).id;
    return { skinId: state.avatarSkin };
  }

  function getAvatarSkin() {
    return state.avatarSkin;
  }

  function setVisualPreset(presetId) {
    state.visualPreset = (VISUAL_PRESETS[presetId] ?? VISUAL_PRESETS["sakura-lite"]).id;
    return { presetId: state.visualPreset };
  }

  function getVisualPreset() {
    return state.visualPreset;
  }

  function getAvailableSkins() {
    return availableSkins;
  }

  function getAvailableVisualPresets() {
    return availablePresets;
  }

  function getStatus() {
    return state.status;
  }

  function dispose() {}

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

