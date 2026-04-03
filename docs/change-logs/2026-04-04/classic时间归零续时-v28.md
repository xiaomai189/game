# 变更记录：Classic 时间归零续时（v28）

## 改动摘要
- 修复 `Classic` 模式“Time 到 0 即结束”的逻辑。
- 现在倒计时归零后自动续时，游戏继续进行。
- 保留碰撞结束机制：撞到错误通道仍会 `GAME_OVER`。
- 增加自动化回归脚本，覆盖“时间续时 + 碰撞结束”两条关键路径。

## 代码变更
- [web/game/modes/classic.js](/E:/AI/yolo-test/game/web/game/modes/classic.js)
  - `step()` 中移除 `time<=0 => GAME_OVER`。
  - 改为倒计时循环回补：时间归零自动补回一个周期后继续运行。
- [web/game/index.js](/E:/AI/yolo-test/game/web/game/index.js)
  - HUD 规则文案补充：`Time 到 0 自动续时`。
- [scripts/test-web-classic-timer.mjs](/E:/AI/yolo-test/game/scripts/test-web-classic-timer.mjs)
  - 新增 web 回归：验证时间跨过 0 后仍 `RUNNING`，且碰撞仍 `GAME_OVER`。
- [package.json](/E:/AI/yolo-test/game/package.json)
  - 新增脚本 `test:web-classic-timer`。
- [scripts/preflight.mjs](/E:/AI/yolo-test/game/scripts/preflight.mjs)
  - 预检流程新增 `npm run test:web-classic-timer`。

## 验证结果
- `npm run build`：通过
- `npm run test:web-gesture`：通过
- `npm run test:web-classic-timer`：通过
- `npm run preflight`：通过
  - `pytest -q`: 17 passed
  - `build`: passed
  - `web-gesture`: passed
  - `web-classic-timer`: passed

## 证据
- [2026-04-04-classic-timer-loop-v28.png](/E:/AI/yolo-test/game/docs/evidence/2026-04-04-classic-timer-loop-v28.png)
