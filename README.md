# YOLO Pose Game (Windows Prototype)

本项目是一个基于摄像头与 YOLO Pose 的体感小游戏原型，目标是在 Windows 本机完成实时姿态识别与基础交互。

## 快速开始
1. 创建虚拟环境并激活：
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. 安装依赖：
```powershell
pip install -r requirements.txt
```

或使用一键脚本（推荐）：
```powershell
.\scripts\bootstrap.ps1
```

3. 准备模型（可选但推荐）：
- 将 `yolo11n-pose.pt` 放到 `models/` 目录。
- 若未放置模型，程序仍可运行，但不会输出姿态与动作结果。

4. 启动程序：
```powershell
python main.py
```

最小可演示 Demo（无摄像头）：
```powershell
python main.py --demo --max-frames 300 --no-display --save-preview docs/evidence/2026-04-02-demo-preview.png
```

无人值守烟雾验证（处理固定帧后退出）：
```powershell
python main.py --max-frames 300 --no-display
```

退出按键：`Q` 或 `ESC`。

## 玩法说明（当前首版）
- 游戏启动后自动进入 `RUNNING` 状态并开始倒计时。
- 将任意一只手移动到黄色目标圈内即可得分（默认不强制举手）。
- HUD 会显示状态、剩余时间、分数、命中数与动作状态。

## 运行测试
```powershell
pytest -q
```

## 参数
- `--camera-index`：摄像头索引
- `--device`：推理设备（例如 `cpu`、`cuda:0`）
- `--model`：模型路径（默认 `models/yolo11n-pose.pt`）
- `--duration-sec`：覆盖单局时长（秒）
- `--max-frames`：最多处理帧数（默认 0，表示不限制）
- `--no-display`：禁用窗口显示，适合无人值守测试
- `--demo`：启用合成演示模式（不依赖摄像头和模型）
- `--save-preview`：保存最后一帧到图片路径
- `--websocket-port`：Web 游戏桥接端口（默认 `8765`）
- `--disable-websocket`：关闭 WebSocket 输出
- `--show-camera-game-overlay`：在摄像头窗口显示游戏叠加（默认关闭）
- `--perf-report`：导出本次运行性能报告（JSON）

性能采样示例（无摄像头 Demo）：
```powershell
python main.py --demo --no-display --max-frames 300 --disable-websocket --perf-report docs/evidence/perf-sample.json
```
报告包含 `captureFps`、`inferFps`、`renderFps`、`p95LatencyMs`、`frameDropRate`。

## Web 跑酷 P1（网页界面）
1. 启动姿态服务（建议保留摄像头窗口，便于按键重开）：
```powershell
.\.venv\Scripts\python.exe main.py --websocket-port 8765
```

2. 另开终端启动网页静态服务：
```powershell
npm run serve:web
```

3. 浏览器访问：
```text
http://127.0.0.1:8080
```

4. 操作方式：
- 进入页面后点击 `启动` 开始；可用 `暂停`/`继续` 控制节奏，`重开` 可立即重置并开新局。
- 抬左手切到左道，抬右手切到右道，双手不抬回到中道。
- 左右切道即时生效；双手不抬时约 `30ms` 后回中。
- 侧向切道后会有约 `70ms` 的反向锁定窗口，减少左右抖动反复跳道。
- 姿态流中断（约 `300ms`）期间会冻结换道输入，保持当前道位。
- 镜像模式下已做左右手语义校正（按你的体感方向判定左右手）。
- 躲避从上方下落障碍；下蹲可触发短时护盾，允许“穿一次错误通道”。
- 动画特效支持自动质量降级（`high -> low`），低帧率时会自动降低粒子与残影数量。

5. Web 换道回归测试：
```powershell
npm run test:web-gesture
```
该命令会自动启动本地静态服务并执行 Playwright 关键路径断言。

6. 一键预检（提交前建议）：
```powershell
npm run preflight
```
该命令会顺序执行 `pytest -q`、`npm run build`、`npm run test:web-gesture`。

## CI 门禁
- 已提供 GitHub Actions 工作流：`.github/workflows/ci.yml`
- 触发后会执行与本地预检一致的三项检查：
  - Python 单元测试
  - Web 构建
  - Web 换道回归

## 一键运行（Windows）
1. PowerShell 一键启动（自动安装依赖 + 构建 + 拉起后端与 Web）：
```powershell
.\scripts\run-oneclick.ps1
```

2. 双击启动（无需手动输命令）：
```text
scripts\run-oneclick.bat
```

3. 停止一键启动拉起的进程：
```powershell
.\scripts\stop-oneclick.ps1
```

4. 常用参数示例：
```powershell
.\scripts\run-oneclick.ps1 -SkipInstall -SkipBuild
.\scripts\run-oneclick.ps1 -Demo -NoDisplay
.\scripts\run-oneclick.ps1 -WebPort 8081 -WebsocketPort 9876
```

## v21 训练玩法模式（不影响旧玩法）
- 默认仍为 `classic`（兼容旧运行逻辑）。
- 可通过 URL 切换模式：
```text
http://127.0.0.1:8080/?mode=sprint_lane
http://127.0.0.1:8080/?mode=squat_gate
http://127.0.0.1:8080/?mode=reaction_drill
```
- 运行中快捷键切换：
  - `0` -> `classic`
  - `1` -> `sprint_lane`
  - `2` -> `squat_gate`
  - `3` -> `reaction_drill`
- 新增模式回归测试：
```powershell
npm run test:web-workout
```

## Web Architecture (v24)
- Entry point: `web/game/index.js`
- Isolated mode modules:
  - `web/game/modes/classic.js`
  - `web/game/modes/sprint_lane.js`
  - `web/game/modes/squat_gate.js`
  - `web/game/modes/reaction_drill.js`
- Compatibility shim: `web/game.js` (imports new entry)
- Public browser APIs remain unchanged:
  - `window.switch_workout_mode(mode)`
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`
  - `window.inject_pose_payload(actions, options?)`

## Demo Behavior (v23)
- `--demo`: neutral demo input (no automatic lane switching)
- `--demo --demo-auto-actions`: enable automatic synthetic actions for showcase

## Mode Note (v26)
- The workout modes `sprint_lane`, `squat_gate`, and `reaction_drill` were removed.
- Current playable web mode is `classic` only.
- Backward compatibility:
  - `window.switch_workout_mode(...)` still exists but now maps to classic mode.

## Dual Race (v42)
- New mode: `dual_race` (split-screen, shared obstacle map).
- Fixed mapping: `P1 = camera 0`, `P2 = camera 1`.
- Round rule: wrong lane eliminates only that player; match ends when timer reaches 0; higher score wins.

Quick start:
```powershell
.\.venv\Scripts\python.exe main.py --camera-sources "0,1"
python -m http.server 8080 -d web
```
Open `http://127.0.0.1:8080`, set:
- `Input = camera`
- `Mode = Dual Race`

One-click script now defaults to dual camera sources:
```powershell
.\scripts\run-oneclick.ps1
```

## Live Dual-Camera Verification (v43)
- After backend is running, verify both cameras are actually present in websocket frames:

```powershell
.\scripts\test-live-dual-camera.ps1
```

- Optional parameters:

```powershell
.\scripts\test-live-dual-camera.ps1 -WsUrl "ws://127.0.0.1:8765" -RequiredCameras "0,1" -TimeoutSec 15 -MinFramesPerCamera 8
```

## Reconnect Diagnostics (v43)
- Connection banner now shows reconnect countdown/attempt while camera stream is offline.
- `window.get_transport_state()` is available for runtime diagnostics.
- `window.render_game_to_text()` now includes `transport` diagnostics (`retryCount`, `retryInMs`, `socketState`, `lastError`).
Optional override:
```powershell
.\scripts\run-oneclick.ps1 -CameraSources "0,1"
```

## Dual Runtime Guard (v44)
- Startup self-check and runtime auto-degrade are enabled for dual-camera stability.
- Auto mode enters `Dual Race` only when backend reports `runtime.dualReady=true`.
- When dual stream is unhealthy, backend degrades to single-camera play and exposes reasons in diagnostics.

New CLI overrides:
```powershell
python main.py --self-check-sec 8 --dual-min-fps 6 --max-input-age-ms 1200 --auto-degrade true
```

Key fields added to websocket payload:
- `runtime.dualRequested`
- `runtime.dualReady`
- `runtime.selfCheckStatus`
- `runtime.reason`
- `runtime.degradedCameraIds`
- `cameras[i].pipeline.healthLevel`
- `cameras[i].pipeline.healthReason`
