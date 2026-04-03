# 变更记录：Classic 可玩性兜底（v27）

## 改动摘要
- 为 classic 增加键盘兜底控制（←/→/↓ 与 A/D/S）。
- 增加“手动输入优先窗口”，避免 websocket 姿态流即时覆盖键盘输入。
- 更新页面提示文案。
- 修复 `stop-oneclick.ps1` 在 pid 文件已不存在时的报错。

## 代码变更
- [web/game/index.js](/E:/AI/yolo-test/game/web/game/index.js)
  - 新增键盘控制与 keyup/keydown 处理
  - 新增 `manualOverrideUntil` 逻辑，短时忽略 ws 输入
  - 修正连接文案与 HUD 目标/规则文案
- [web/index.html](/E:/AI/yolo-test/game/web/index.html)
  - tips 文案新增键盘兜底说明
- [scripts/stop-oneclick.ps1](/E:/AI/yolo-test/game/scripts/stop-oneclick.ps1)
  - pid 文件不存在时不再抛错

## 验证结果
- `npm run preflight`：通过
  - `pytest -q`: 17 passed
  - `npm run build`: passed
  - `npm run test:web-gesture`: passed
- 手工验证：按 `ArrowLeft` 后 `laneLabel` 变为 `left`，抬键后回 `middle`。

## 证据
- [2026-04-04-classic-playable-v27.png](/E:/AI/yolo-test/game/docs/evidence/2026-04-04-classic-playable-v27.png)
