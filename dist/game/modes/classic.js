const LANES = [340, 640, 940];
const PLAYER_Y = 568;
const LANE_BLOCK_WIDTH = 170;
const LANE_BLOCK_HEIGHT = 96;
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
const STREAM_FREEZE_MS = 300;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function randomLane() {
  return Math.floor(Math.random() * 3);
}

export function createClassicMode({ canvas, ctx, initialNow }) {
  const state = {
    status: "READY",
    lane: 1,
    intentLane: "hold",
    centerIntentSince: 0,
    switchLockUntil: 0,
    switchFxUntil: 0,
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
    lastPayloadActions: { leftHandUp: false, rightHandUp: false, squat: false },
  };

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
    state.obstacles = [];
    state.spawnAt = now + 300;
    state.lastStepAt = now;
    state.runtimeHealthScore = 100;
    state.runtimeStride = 1;
    state.runtimeScale = 1;
    state.runtimeTrackingQuality = 1;
    state.runtimeCalibrationProgress = 1;
    state.runtimePaceFactor = 1;
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
      state.switchFxUntil = now + 180;
      state.switchLockUntil = state.lane === 1 ? 0 : now + LANE_SWITCH_LOCK_MS;
    }
  }

  function registerMiss(now) {
    state.hp = 0;
    state.comboCount = 0;
    state.comboMultiplier = 1;
    state.missFlashUntil = now + 180;
    setStatus("GAME_OVER");
  }

  function registerPass(now) {
    state.score += 1;
    state.comboCount += 1;
    state.maxCombo = Math.max(state.maxCombo, state.comboCount);
    state.hitFlashUntil = now + 120;
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
      // Time is now a repeating rhythm window instead of a hard game-over condition.
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
      if (shieldActive || obs.safeLane === state.lane) {
        registerPass(now);
      } else {
        registerMiss(now);
      }
    }
    state.obstacles = state.obstacles.filter((obs) => obs.y <= canvas.height + LANE_BLOCK_HEIGHT);
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, "#08173f");
    grad.addColorStop(1, "#21114b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(140,210,255,0.16)";
    ctx.lineWidth = 2;
    for (const x of LANES) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }

  function drawObstacles() {
    for (const obs of state.obstacles) {
      for (let i = 0; i < 3; i += 1) {
        const x = LANES[i] - LANE_BLOCK_WIDTH / 2;
        const y = obs.y - LANE_BLOCK_HEIGHT / 2;
        if (i === obs.safeLane) {
          ctx.strokeStyle = "rgba(90,242,255,0.9)";
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, LANE_BLOCK_WIDTH, LANE_BLOCK_HEIGHT);
        } else {
          ctx.fillStyle = "rgba(247,88,170,0.85)";
          ctx.fillRect(x, y, LANE_BLOCK_WIDTH, LANE_BLOCK_HEIGHT);
        }
      }
    }
  }

  function drawPlayer(now) {
    const x = LANES[state.lane];
    const shield = now <= state.shieldUntil;
    ctx.fillStyle = "rgba(40,50,100,0.7)";
    ctx.beginPath();
    ctx.ellipse(x, PLAYER_Y + 26, 80, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6af6ff";
    ctx.beginPath();
    ctx.arc(x, PLAYER_Y, 24, 0, Math.PI * 2);
    ctx.fill();

    if (shield) {
      ctx.strokeStyle = "rgba(120,255,180,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, PLAYER_Y, 38, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (now <= state.switchFxUntil) {
      const t = clamp((state.switchFxUntil - now) / 180, 0, 1);
      const switchRadius = Math.max(2, 44 + (1 - t) * 22);
      ctx.strokeStyle = `rgba(79,248,255,${0.55 * t})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, PLAYER_Y, switchRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawOverlay(now, shared) {
    if (shared.staleMs > 1300) {
      ctx.fillStyle = "rgba(255,215,110,0.2)";
      ctx.fillRect(24, 24, 360, 44);
      ctx.fillStyle = "#ffe8a1";
      ctx.font = "700 22px Trebuchet MS";
      ctx.fillText("Waiting Pose Stream...", 36, 54);
    }

    if (now <= state.hitFlashUntil) {
      ctx.fillStyle = "rgba(96,255,190,0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (now <= state.missFlashUntil) {
      ctx.fillStyle = "rgba(255,86,160,0.16)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (state.status === "READY") {
      ctx.fillStyle = "rgba(8,10,22,0.42)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#98f0ff";
      ctx.font = "800 42px Trebuchet MS";
      ctx.fillText("Press Start to begin", canvas.width / 2 - 180, 312);
    } else if (state.status === "PAUSED") {
      ctx.fillStyle = "rgba(10,10,24,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffe18a";
      ctx.font = "800 64px Trebuchet MS";
      ctx.fillText("PAUSED", canvas.width / 2 - 126, 320);
    } else if (state.status === "GAME_OVER") {
      ctx.fillStyle = "rgba(8,10,24,0.7)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ff8ab7";
      ctx.font = "900 62px Trebuchet MS";
      ctx.fillText("SESSION COMPLETE", canvas.width / 2 - 280, 275);
      ctx.fillStyle = "#eaf2ff";
      ctx.font = "700 28px Trebuchet MS";
      ctx.fillText(`Score ${state.score}`, canvas.width / 2 - 80, 326);
    }
  }

  function render(now, shared) {
    drawBackground();
    drawObstacles();
    drawPlayer(now);
    drawOverlay(now, shared);
  }

  function getHud(now) {
    const assistTag = state.runtimePaceFactor < 0.9 ? ` | Assist ${Math.round((1 - state.runtimePaceFactor) * 100)}%` : "";
    return {
      statusText: `Status: ${state.status} | Classic${assistTag}`,
      timeText: `Time: ${Math.max(0, state.timeLeftSec).toFixed(1)}s`,
      scoreText: `Score: ${state.score}`,
      hitsText: `Pose Hits: ${state.poseHits}`,
      laneText: `Lane: ${laneLabelByIndex(state.lane).replace(/^./, (s) => s.toUpperCase())}`,
      hp: state.hp,
      maxHp: state.maxHp,
      now,
    };
  }

  function renderToText(now, shared) {
    const switchLockMsLeft = Math.max(0, state.switchLockUntil - now);
    const centerCommitMsLeft =
      state.centerIntentSince > 0 ? Math.max(0, CENTER_COMMIT_MS - (now - state.centerIntentSince)) : 0;
    return JSON.stringify({
      coordinateSystem: {
        origin: "top-left",
        xAxis: "right-positive",
        yAxis: "down-positive",
        unit: "pixel",
      },
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
      obstacles: state.obstacles.slice(0, 8).map((o) => ({
        y: Number(o.y.toFixed(1)),
        kind: "lane_gate",
        safeLane: o.safeLane,
        checked: o.checked,
      })),
      stream: {
        connected: Boolean(shared.connected),
        staleMs: Number(Math.max(0, shared.staleMs).toFixed(1)),
      },
      runtime: {
        healthScore: Number(state.runtimeHealthScore.toFixed(2)),
        paceFactor: Number(state.runtimePaceFactor.toFixed(3)),
        inferenceStrideFrames: Number(state.runtimeStride.toFixed(2)),
        inferenceScale: Number(state.runtimeScale.toFixed(3)),
        trackingQuality: Number(state.runtimeTrackingQuality.toFixed(3)),
        calibrationProgress: Number(state.runtimeCalibrationProgress.toFixed(3)),
      },
      control: {
        intentLane: state.intentLane,
        switchLockMsLeft: Number(switchLockMsLeft.toFixed(1)),
        centerCommitMsLeft: Number(centerCommitMsLeft.toFixed(1)),
      },
      training: {
        intervalPhase: "sprint",
        intervalSecLeft: 20,
        reactionTarget: null,
        reactionDeadlineMs: 0,
        reactionHighSpeedLeftMs: 0,
      },
      stats: {
        actionsTotal: 0,
        actionsCorrect: 0,
        reactionHits: 0,
        reactionAvgMs: 0,
        fastHits: 0,
        maxCombo: state.maxCombo,
      },
      visual: {
        fxQuality: "high",
        renderMode: "mode-isolated",
        assetsLoaded: true,
        assetTheme: "neon",
        assetFallbackEnabled: true,
        assetFallbackReason: null,
        trailCount: 0,
        particleCount: 0,
      },
    });
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
    dispose,
  };
}
