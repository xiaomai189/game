# 变更记录：Web 多模式模块化重构（v24）

## 本次改动
- 将单文件 `web/game.js` 重构为模块化结构：
  - `web/game/index.js`（入口调度）
  - `web/game/modes/classic.js`
  - `web/game/modes/sprint_lane.js`
  - `web/game/modes/squat_gate.js`
  - `web/game/modes/reaction_drill.js`
- `web/game.js` 改为轻入口（仅导入新入口文件）。
- 保持对外接口兼容：
  - `window.switch_workout_mode`
  - `window.render_game_to_text`
  - `window.advanceTime`
  - `window.inject_pose_payload`
  - URL `?mode=...`
- 修复 `tests/test_game_engine.py` 中随机重生导致的偶发失败，改为确定性时间点断言。

## 影响评估
- 原有 Web 自动化回归脚本无需修改，全部通过。
- 现有一键启动流程保持可用。
- 模式切换行为保持：切换后自动进入新模式运行态。

## 验证结果
- `npm run build`：通过
- `npm run preflight`：通过
  - `pytest -q`：17 passed
  - `npm run test:web-gesture`：passed
  - `npm run test:web-workout`：passed

## 证据
- [运行截图（Sprint Lane）](/E:/AI/yolo-test/game/docs/evidence/2026-04-04-web-modular-v24.png)
