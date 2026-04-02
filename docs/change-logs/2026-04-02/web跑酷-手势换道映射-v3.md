# 变更记录：Web 跑酷手势换道映射 v3

## 基本信息
- 日期：2026-04-02
- 任务/PRD：`docs/rpd/2026-04-02-跑酷手势换道映射-v3.md`
- 负责人：Codex

## 改动内容
- `web/game.js`
  - 换道逻辑改为手势驱动：
    - 抬左手 -> 左道
    - 抬右手 -> 右道
    - 双手不抬 -> 中道
    - 双手同时抬起 -> 保持当前道
- `web/index.html`
  - 提示文案改为手势换道描述。
- `README.md`
  - Web 跑酷操作说明同步更新。

## 改动原因
- 满足“抬左右手/不抬手对应三条道”的直观交互诉求。

## 验证结果
- Web 构建：通过  
  - `npm run build`
- Python 测试：通过  
  - `.\.venv\Scripts\python.exe -m pytest -q`  
  - 结果：`11 passed`
- UI 运行验证：通过  
  - 本地启动姿态服务 + Web 页面，规则文案和画面行为与新映射一致。

## UI 证据
- `docs/evidence/2026-04-02-web-runner-p1-v3-hand-lane.png`
- `docs/evidence/2026-04-02-web-runner-p1-v3-hand-lane.md`
