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

const state = {
  connected: false,
  lastPayloadTs: 0,
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
    score: 0,
    timeLeftSec: 45,
    shieldUntil: 0,
    obstacles: [],
    spawnAt: 0,
    lastStepAt: 0,
  },
};

const lanes = [340, 640, 940];
const playerY = 570;
const laneBlockWidth = 170;
const laneBlockHeight = 92;
const worldSpeedBase = 240;
const speedGainCap = 120;
const speedGainPerScore = 1.2;
const spawnMsBase = 1150;
const spawnMsDrop = 250;
const runnerDuration = 45;
const centerCommitMs = 50;

function resolveDesiredLane(payload) {
  const leftUp = Boolean(payload.actions?.leftHandUp);
  const rightUp = Boolean(payload.actions?.rightHandUp);
  if (leftUp && !rightUp) return 0;
  if (!leftUp && rightUp) return 2;
  if (!leftUp && !rightUp) return 1;
  return null;
}

function applyLaneImmediately(desiredLane) {
  const now = performance.now();
  const runner = state.runner;
  if (desiredLane == null) return;

  if (desiredLane === 0 || desiredLane === 2) {
    runner.centerIntentSince = 0;
    runner.lane = desiredLane;
    return;
  }

  if (desiredLane === 1) {
    if (runner.lane === 1) {
      runner.centerIntentSince = 0;
      return;
    }
    if (runner.centerIntentSince === 0) {
      runner.centerIntentSince = now;
      return;
    }
    if (now - runner.centerIntentSince >= centerCommitMs) {
      runner.lane = 1;
      runner.centerIntentSince = 0;
    }
  }
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

function resetRunner(now) {
  state.runner.score = 0;
  state.runner.timeLeftSec = runnerDuration;
  state.runner.shieldUntil = 0;
  state.runner.obstacles = [];
  state.runner.spawnAt = now + 280;
  state.runner.lastStepAt = now;
  state.runner.centerIntentSince = 0;
}

function startGame() {
  const now = performance.now();
  resetRunner(now);
  setRunnerStatus("RUNNING");
}

function pauseGame() {
  if (state.runner.status !== "RUNNING") return;
  setRunnerStatus("PAUSED");
}

function resumeGame() {
  if (state.runner.status !== "PAUSED") return;
  state.runner.lastStepAt = performance.now();
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
    connEl.style.color = "#ffd166";
    setTimeout(connect, 1000);
  };
  ws.onerror = () => {
    ws.close();
  };
  ws.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.type !== "frame") return;
      state.lastPayloadTs = performance.now();
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
  runner.obstacles = runner.obstacles.filter((o) => o.y - laneBlockHeight < canvas.height);

  if (now >= runner.spawnAt) {
    spawnObstacle(now);
  }

  if (state.py.actions?.squat) {
    runner.shieldUntil = Math.max(runner.shieldUntil, now + 350);
  }

  for (const obs of runner.obstacles) {
    if (obs.checked) continue;
    if (obs.y >= playerY - laneBlockHeight * 0.35) {
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

function drawBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grd.addColorStop(0, "#11263f");
  grd.addColorStop(1, "#071321");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 3; i += 1) {
    const x = lanes[i];
    ctx.fillRect(x - 2, 0, 4, canvas.height);
  }
}

function drawPlayer(now) {
  const lane = state.runner.lane;
  const x = lanes[lane];
  const shield = now <= state.runner.shieldUntil;
  const radius = shield ? 42 : 34;
  ctx.beginPath();
  ctx.arc(x, playerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = shield ? "#8df5c5" : "#7cc9ff";
  ctx.fill();
  ctx.strokeStyle = shield ? "#3ce58f" : "#96dcff";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawObstacle(obs) {
  ctx.fillStyle = "rgba(236,77,91,0.9)";
  for (let i = 0; i < 3; i += 1) {
    if (i === obs.safeLane) continue;
    const laneX = lanes[i];
    ctx.fillRect(
      laneX - laneBlockWidth / 2,
      obs.y - laneBlockHeight / 2,
      laneBlockWidth,
      laneBlockHeight
    );
  }
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 3;
  const safeX = lanes[obs.safeLane];
  ctx.strokeRect(
    safeX - laneBlockWidth / 2 - 8,
    obs.y - laneBlockHeight / 2 - 8,
    laneBlockWidth + 16,
    laneBlockHeight + 16
  );
}

function drawOverlay(now) {
  const py = state.py;
  const connectionStale = now - state.lastPayloadTs > 1200;
  gameStatusEl.textContent = `状态: ${statusText(state.runner.status)}`;
  timerEl.textContent = `时间: ${Math.max(0, state.runner.timeLeftSec ?? runnerDuration).toFixed(1)}s`;
  scoreEl.textContent = `生存分: ${state.runner.score}`;
  hitsEl.textContent = `识别命中: ${py.hits ?? 0}`;
  laneEl.textContent = `通道: ${["左", "中", "右"][state.runner.lane]}`;

  if (connectionStale) {
    ctx.fillStyle = "rgba(255,209,102,0.18)";
    ctx.fillRect(28, 24, 430, 52);
    ctx.fillStyle = "#ffd166";
    ctx.font = "28px Segoe UI";
    ctx.fillText("等待姿态数据…", 42, 58);
  }

  if (state.runner.status === "GAME_OVER") {
    ctx.fillStyle = "rgba(7,12,20,0.74)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ff6b6b";
    ctx.font = "700 72px Segoe UI";
    ctx.fillText("GAME OVER", canvas.width / 2 - 220, 280);
    ctx.fillStyle = "#eaf3ff";
    ctx.font = "38px Segoe UI";
    ctx.fillText(`生存分：${state.runner.score}`, canvas.width / 2 - 120, 350);
    ctx.font = "28px Segoe UI";
    ctx.fillText("点击“重开”再来一局", canvas.width / 2 - 140, 410);
  } else if (state.runner.status === "PAUSED") {
    ctx.fillStyle = "rgba(7,12,20,0.54)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffd166";
    ctx.font = "700 64px Segoe UI";
    ctx.fillText("PAUSED", canvas.width / 2 - 150, 320);
  } else if (state.runner.status === "READY") {
    ctx.fillStyle = "rgba(7,12,20,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#96dcff";
    ctx.font = "700 46px Segoe UI";
    ctx.fillText("点击“启动”开始", canvas.width / 2 - 170, 320);
  }
}

function frame(now) {
  drawBackground();
  step(now);
  for (const obs of state.runner.obstacles) {
    drawObstacle(obs);
  }
  drawPlayer(now);
  drawOverlay(now);
  requestAnimationFrame(frame);
}

btnStart.addEventListener("click", startGame);
btnPause.addEventListener("click", pauseGame);
btnResume.addEventListener("click", resumeGame);
btnRestart.addEventListener("click", restartGame);

connect();
updateControlButtons();
requestAnimationFrame(frame);
