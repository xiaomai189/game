# 变更记录：Web 跑酷控制按钮 v5

## 基本信息
- 日期：2026-04-02
- 任务/PRD：`docs/rpd/2026-04-02-web跑酷-控制按钮-v5.md`
- 负责人：Codex

## 改动内容
- `web/index.html`
  - 新增状态字段 `状态: ...`。
  - 新增控制按钮：`启动`、`暂停`、`继续`、`重开`。
  - 更新提示文案，强调先启动再体感操作。
- `web/styles.css`
  - 新增控制按钮区样式与禁用态样式。
- `web/game.js`
  - 新增本地状态机控制逻辑：
    - `statusText`、`updateControlButtons`、`setRunnerStatus`
    - `startGame`、`pauseGame`、`resumeGame`、`restartGame`
  - `onPose()` 调整为仅消费动作输入，不再由后端 `status` 直接触发开局。
  - 新增本地倒计时 `timeLeftSec`，并在暂停/继续时保持时序正确。
  - 补充 `READY` 与 `PAUSED` 覆盖层提示文案。
- `README.md`
  - Web 跑酷操作说明补充按钮控制方式。

## 改动原因
- 让演示流程更直观、可控，减少“只有姿态画面但游戏未开局”的困惑。

## 验证结果
- Web 构建：通过
  - `npm run build`
- Python 测试：通过
  - `.\.venv\Scripts\python.exe -m pytest -q`
  - 结果：`11 passed`
- 关键功能验收：
  - 按钮与状态机逻辑已落地（启动/暂停/继续/重开）。
  - 手势换道与下蹲护盾逻辑保持可用。

## UI 证据
- `docs/evidence/2026-04-02-web-runner-controls-v5.md`
- `docs/evidence/2026-04-02-web-runner-controls-v5.txt`

