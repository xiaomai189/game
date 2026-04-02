# 变更记录：最小可演示 Demo 闭环

## 基本信息
- 日期：2026-04-02
- 任务/PRD：`docs/rpd/2026-04-02-最小可演示demo闭环.md`
- 负责人：Codex

## 改动内容
- `core/game_engine.py`
  - 增加状态机：`READY / RUNNING / GAME_OVER`。
  - 增加单局时长倒计时与命中冷却控制。
  - 增加 `start/reset/snapshot(now)`，支持可控状态流转和可测性。
- `core/renderer.py`
  - HUD 新增状态、倒计时、命中数显示。
  - 增加 READY/GAME_OVER 提示文案。
- `main.py`
  - 新增 `--demo`（合成演示模式）。
  - 新增 `--duration-sec`（覆盖局时长）。
  - 新增 `--save-preview`（保存最终渲染帧）。
  - 保留 `--max-frames --no-display` 以支持无人值守演示。
- `tests/test_game_engine.py`
  - 适配状态机改造。
  - 新增冷却与倒计时结束测试。
- `README.md`
  - 补充最小演示命令与新增参数说明。

## 改动原因
- 将项目从“可运行模块集合”提升为“可直接演示闭环”。
- 保证在无摄像头/无模型现场也能快速演示流程和 UI。

## 验证结果
- 构建（Python 语法构建替代）：通过  
  - `.\.venv\Scripts\python.exe -m compileall config.py main.py core tests`
- 测试：通过  
  - `.\.venv\Scripts\python.exe -m pytest -q`  
  - 结果：`8 passed`
- 演示运行：通过  
  - `.\.venv\Scripts\python.exe main.py --demo --duration-sec 8 --max-frames 260 --no-display --save-preview docs/evidence/2026-04-02-min-demo.png`
  - 结果：成功生成预览图。

## UI 证据
- `docs/evidence/2026-04-02-min-demo.png`
- `docs/evidence/2026-04-02-min-demo.md`

## 备注
- `npm run build` 执行情况及说明：已执行，失败。  
  原因：仓库不存在 `package.json`，当前项目为 Python 工程。
