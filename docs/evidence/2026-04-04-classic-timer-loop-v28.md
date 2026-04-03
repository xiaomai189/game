# 证据：Classic 时间归零续时（v28）

## 场景
- 启动 `web` 页面并点击“启动”。
- 固定随机数为中道安全，推进时间 `46s`（跨过一个 `45s` 周期）。

## 预期与结果
- 预期：`Time` 到 `0` 后不进入 `GAME_OVER`，继续 `RUNNING`。
- 实测：自动续时，状态保持 `RUNNING`。

## 截图
- `docs/evidence/2026-04-04-classic-timer-loop-v28.png`
