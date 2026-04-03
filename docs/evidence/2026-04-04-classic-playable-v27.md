# 证据：Classic 可玩性兜底（v27）

## 场景
- 访问 `http://127.0.0.1:8080`
- 点击“启动”
- 使用键盘 `ArrowLeft`

## 预期与结果
- 预期：角色切到左道，不会被姿态流立即拉回中道。
- 实测：
  - `laneLabel = left`（按键时）
  - 释放按键后回 `middle`

## 截图
- `docs/evidence/2026-04-04-classic-playable-v27.png`
