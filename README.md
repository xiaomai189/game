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
