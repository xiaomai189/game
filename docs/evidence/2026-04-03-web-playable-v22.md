# 证据：Web 可玩性验证（v22）

## 执行环境
- 时间：2026-04-03
- 目录：`E:\AI\yolo-test\game`
- 启动命令：`.\scripts\run-oneclick.ps1 -SkipInstall -SkipBuild -NoBrowser -Demo -NoDisplay -WebPort 19080`

## 自动化回归
- 命令：`npm run preflight`
- 结果：通过
  - `pytest -q`：15 passed
  - `npm run build`：passed
  - `npm run test:web-gesture`：passed
  - `npm run test:web-workout`：passed

## 保活验证
- 命令：`python main.py --demo --no-display --duration-sec 1 --websocket-port 18765`
- 结果：启动 4 秒后进程仍存活（`RUNNING`），证明 `GAME_OVER` 不再触发自动退出。

## 页面可见性与模式验证
- URL：`http://127.0.0.1:19080/?mode=squat_gate`
- 页面状态：
  - `Status: READY | Squat Gate`
  - `stream.connected=true`
- 截图：`docs/evidence/2026-04-03-web-mode-visible-squat.png`

## 前端错误检查
- Playwright console（当前页）：
  - `Total messages: 0 (Errors: 0, Warnings: 0)`
- 说明：联调期间出现过 `Canvas arc radius negative`，已在 `web/game.js` 加保护后复测消失。
