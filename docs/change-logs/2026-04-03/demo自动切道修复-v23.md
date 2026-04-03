# 变更记录：Demo 自动切道修复（v23）

## 改动摘要
- 修复 `--demo` 模式下网页跑酷自动中右切换的问题。
- 增加 demo 自动动作显式开关，默认关闭自动动作。

## 代码变更
- [main.py](/E:/AI/yolo-test/game/main.py)
  - 新增参数：`--demo-auto-actions`
  - `_build_demo_action` 增加 `auto_actions` 参数，默认 `False`
  - demo 主循环按 `args.demo_auto_actions` 决定是否注入自动动作
- [tests/test_main_demo_action.py](/E:/AI/yolo-test/game/tests/test_main_demo_action.py)
  - 新增测试：
    - demo 默认中立动作
    - 显式开启自动动作后保留原演示行为

## 验证
- `pytest -q`：17 passed
- `npm run build`：通过
- Playwright 实机联调（Demo + NoDisplay）：
  - 连续采样 lane 唯一值为 `middle`
  - 证据见 [2026-04-03-demo-lane-stable-v23.md](/E:/AI/yolo-test/game/docs/evidence/2026-04-03-demo-lane-stable-v23.md)
