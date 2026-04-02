# UI 证据：Web 跑酷控制按钮 v5

## 证据类型
- 等效证据（DOM + 脚本实现片段），用于证明按钮与状态机已落地。

## 证据文件
- `docs/evidence/2026-04-02-web-runner-controls-v5.txt`

## 说明
- 当前环境下 Playwright 会话异常，浏览器自动截图链路不可用，因此采用“等效证据”方式留档。
- 等效证据包含：
  - `web/index.html` 中控制按钮节点（`btnStart/btnPause/btnResume/btnRestart`）。
  - `web/game.js` 中控制函数与 `PAUSED` 状态机实现。

