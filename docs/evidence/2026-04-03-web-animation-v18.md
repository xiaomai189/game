# 证据：Web 动画优化 v18

## 证据类型
- UI 截图证据。
- 动画状态 JSON 证据（`render_game_to_text`）。

## 证据文件
- `docs/evidence/2026-04-03-web-animation-v18.png`
- `docs/evidence/2026-04-03-web-animation-v18-state.json`

## 关键检查
- `visual.fxQuality` 字段存在（动画质量档可观测）。
- `visual.trailCount` / `visual.particleCount` 字段存在且非负。
- 连续换道后有残影与尾焰特效状态输出。
