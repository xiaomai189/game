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
const centerCommitMs = 50;

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
    lane: 1,
    centerIntentSince: 0,
    switchFxUntil: 0,
    score: 0,
    timeLeftSec: 45,
    shieldUntil: 0,
    obstacles: [],
    spawnAt: 0,
    lastStepAt: 0,
  },
  visual: {
    skyline: [],
    particles: [],
    lastBgAt: 0,
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

function resolveDesiredLane(payload) {
  const leftUp = Boolean(payload.actions?.leftHandUp);
  const rightUp = Boolean(payload.actions?.rightHandUp);
  if (leftUp && !rightUp) return 0;
  if (!leftUp && rightUp) return 2;
  if (!leftUp && !rightUp) return 1;
  return null;
}

function applyLaneImmediately(desiredLane) {
  const now = getNow();
  const runner = state.runner;
  if (desiredLane == null) return;

  const lastLane = runner.lane;
  if (desiredLane === 0 || desiredLane === 2) {
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
  }
}

function resetRunner(now) {
  state.runner.score = 0;
  state.runner.timeLeftSec = runnerDuration;
  state.runner.shieldUntil = 0;
  state.runner.obstacles = [];
  state.runner.spawnAt = now + 300;
  state.runner.lastStepAt = now;
  state.runner.centerIntentSince = 0;
  state.runner.switchFxUntil = 0;
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
      state.lastPayloadTs = getNow();
      state.py = payload;
      onPose(payload);
    } catch {
      // ignore malformed packets
    }
  };
}

function onPose(payload) {
  applyLaneImmediately(resolveDesiredLane(payload));
}

function spawnObstacle(now) {
  const safeLane = Math.floor(Math.random() * 3);
  state.runner.obstacles.push({
    y: -laneBlockHeight,
    safeLane,
    checked: false,
    seed: Math.random(),
  });
  const elapsedRatio = Math.min(1, state.runner.score / 50);
  const next = spawnMsBase - elapsedRatio * spawnMsDrop;
  state.runner.spawnAt = now + next;
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

  const speed = worldSpeedBase + Math.min(speedGainCap, runner.score * speedGainPerScore);
  for (const obs of runner.obstacles) {
    obs.y += speed * dt;
  }
  runner.obstacles = runner.obstacles.filter((o) => o.y - laneBlockHeight < canvas.height + 50);

  if (now >= runner.spawnAt) {
    spawnObstacle(now);
  }

  if (state.py.actions?.squat) {
    runner.shieldUntil = Math.max(runner.shieldUntil, now + 350);
  }

  for (const obs of runner.obstacles) {
    if (obs.checked) continue;
    if (obs.y >= playerY - laneBlockHeight * 0.34) {
      obs.checked = true;
      if (obs.safeLane === runner.lane) {
        runner.score += 1;
      } else if (now <= runner.shieldUntil) {
        runner.score += 1;
      } else {
        setRunnerStatus("GAME_OVER");
        break;
      }
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

function drawBackground(now) {
  initVisuals();
  updateParticles(now);

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

  for (const p of state.visual.particles) {
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

function drawPlayer(now) {
  const lane = state.runner.lane;
  const x = lanes[lane];
  const shield = now <= state.runner.shieldUntil;

  ctx.fillStyle = "rgba(32,44,98,0.56)";
  ctx.beginPath();
  ctx.ellipse(x, playerY + 24, 78, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  const jitter = Math.sin(now * 0.017) * 2.6;
  ctx.save();
  ctx.translate(x, playerY + jitter);

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
  ctx.lineTo(0, 34 + Math.sin(now * 0.022) * 4);
  ctx.lineTo(10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

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
  }
}

function drawBlockedGate(laneX, y, seed) {
  const x = laneX - laneBlockWidth / 2;
  const top = y - laneBlockHeight / 2;
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
  ctx.restore();

  ctx.strokeStyle = "rgba(255,220,248,0.6)";
  ctx.lineWidth = 2;
  roundedRectPath(x, top, laneBlockWidth, laneBlockHeight, 18);
  ctx.stroke();
}

function drawSafePortal(laneX, y, now) {
  const x = laneX - laneBlockWidth / 2 - 8;
  const top = y - laneBlockHeight / 2 - 8;
  const w = laneBlockWidth + 16;
  const h = laneBlockHeight + 16;
  const pulse = 0.55 + (Math.sin(now * 0.012) + 1) * 0.2;
  ctx.strokeStyle = `rgba(79,248,255,${pulse})`;
  ctx.lineWidth = 3;
  roundedRectPath(x, top, w, h, 20);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,84,176,${pulse * 0.75})`;
  ctx.lineWidth = 1.5;
  roundedRectPath(x + 5, top + 5, w - 10, h - 10, 15);
  ctx.stroke();
}

function drawObstacle(obs, now) {
  for (let i = 0; i < 3; i += 1) {
    if (i === obs.safeLane) continue;
    drawBlockedGate(lanes[i], obs.y, obs.seed);
  }
  drawSafePortal(lanes[obs.safeLane], obs.y, now);
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

function renderAt(now) {
  state.time.now = now;
  drawBackground(now);
  step(now);
  for (const obs of state.runner.obstacles) {
    drawObstacle(obs, now);
  }
  drawPlayer(now);
  drawOverlay(now);
}

function animationLoop(now) {
  renderAt(now);
  requestAnimationFrame(animationLoop);
}

function renderGameToText() {
  const now = getNow();
  const connectionStaleMs = Math.max(0, now - state.lastPayloadTs);
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
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  let now = getNow();
  for (let i = 0; i < steps; i += 1) {
    now += 1000 / 60;
    renderAt(now);
  }
  return renderGameToText();
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
  }
});

btnStart.addEventListener("click", startGame);
btnPause.addEventListener("click", pauseGame);
btnResume.addEventListener("click", resumeGame);
btnRestart.addEventListener("click", restartGame);

connect();
updateControlButtons();
requestAnimationFrame(animationLoop);
