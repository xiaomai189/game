# 变更记录：Web 跑酷交互方向优化 v2

## 基本信息
- 日期：2026-04-02
- 任务/PRD：`docs/rpd/2026-04-02-跑酷交互方向优化-v2.md`
- 负责人：Codex

## 改动内容
- `web/game.js`
  - 障碍运动改为沿 `y` 轴下落（上到下）。
  - 碰撞判定改为“障碍下落到玩家高度时判断通道是否安全”。
  - 绘制逻辑改为“同一高度的一排障碍块 + 安全通道框”。
  - 调整速度与刷新节奏，匹配纵向玩法。
- `web/index.html`
  - 提示文案更新为“躲避从上方下落障碍”。
- `README.md`
  - Web 玩法描述同步更新。

## 改动原因
- 提升体感躲避玩法的直观性，降低学习成本。

## 验证结果
- Python 测试：通过  
  - `.\.venv\Scripts\python.exe -m pytest -q`  
  - 结果：`11 passed`
- Web 构建：通过  
  - `npm run build`
- 运行验证：通过  
  - 启动姿态服务与 Web 页面后，观察到障碍由上向下运动。

## UI 证据
- `docs/evidence/2026-04-02-web-runner-p1-v2-falldown.png`
- `docs/evidence/2026-04-02-web-runner-p1-v2-falldown.md`
