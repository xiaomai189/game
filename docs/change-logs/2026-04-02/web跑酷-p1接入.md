# 变更记录：Web 跑酷 P1 接入

## 基本信息
- 日期：2026-04-02
- 任务/PRD：`docs/rpd/2026-04-02-web跑酷-p1接入.md`
- 负责人：Codex

## 改动内容
- Python 侧
  - 新增 WebSocket 桥接：`core/web_bridge.py`
  - 新增推送载荷构建：`core/web_payload.py`
  - `main.py` 接入桥接发布与新参数：
    - `--websocket-port`
    - `--disable-websocket`
- 测试
  - 新增 `tests/test_web_payload.py`
- 工程与构建
  - 新增 `package.json`
  - 新增构建脚本：`scripts/build-web.mjs`
  - `npm run build` 产物目录：`dist/`
- Web 前端（跑酷 P1）
  - `web/index.html`
  - `web/styles.css`
  - `web/game.js`
  - 功能：三通道躲障碍、下蹲护盾、连接状态与 HUD 展示
- 文档
  - `README.md` 新增 Web 跑酷运行说明

## 改动原因
- 满足“接入网页游戏界面”的需求，并复用当前姿态识别结果。

## 验证结果
- 依赖安装：通过  
  - `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`
- 构建（Python 语法）：通过  
  - `.\.venv\Scripts\python.exe -m compileall config.py main.py core tests`
- 测试：通过  
  - `.\.venv\Scripts\python.exe -m pytest -q`  
  - 结果：`11 passed`
- NPM 构建：通过  
  - `npm run build`
- 运行验证：通过  
  - Web 页面可连接 `ws://127.0.0.1:8765` 并实时更新。

## UI 证据
- `docs/evidence/2026-04-02-web-runner-p1.png`
- `docs/evidence/2026-04-02-web-runner-p1.md`
