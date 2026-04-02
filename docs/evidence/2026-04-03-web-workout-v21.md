# 证据：Web 训练玩法扩展 v21

## 证据类型
- UI 截图证据
- 运行态 JSON 证据（`render_game_to_text`）

## 证据文件
- `docs/evidence/2026-04-03-web-workout-v21.png`
- `docs/evidence/2026-04-03-web-workout-v21-state.json`

## 关键检查
- 默认模式不变：`workoutMode=classic`（由自动化回归断言）
- 训练模式可切换：`sprint_lane/squat_gate/reaction_drill`
- 状态输出包含训练字段：
  - `hp/maxHp`
  - `training.intervalPhase/training.intervalSecLeft`
  - `training.reactionTarget`
  - `stats.actionsCorrect/reactionAvgMs/maxCombo`
- 深蹲门模式可在持续下蹲输入下累积得分（截图与 JSON 中可见）

## 回归命令
- `npm run test:web-gesture`
- `npm run test:web-workout`
- `.\.venv\Scripts\python.exe -m pytest -q`

