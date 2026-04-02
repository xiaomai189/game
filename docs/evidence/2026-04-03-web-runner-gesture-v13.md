# 证据：Web 跑酷体感识别优化 v13

## 证据类型
- UI 截图证据。
- 自动化状态序列证据（Playwright 注入手势 + `render_game_to_text` 输出）。

## 证据文件
- `docs/evidence/2026-04-03-web-runner-gesture-v13.png`
- `docs/evidence/2026-04-03-web-runner-gesture-v13-state.json`

## 关键验证点
- 左手抬起后即时切到左道。
- 70ms 反向锁定窗口内，反向手势不触发跳道。
- 双手不抬约 30ms 后回中。
- `staleBeforeMs > 300ms` 时，换道输入被冻结（`intentLane=hold` 且车道保持）。
