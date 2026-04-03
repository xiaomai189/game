# 证据：游戏端健康联动调节（v31）

## 场景
- 启动 `classic` 模式后注入低健康 pipeline：
  - `healthScore=25`
  - `inferenceStrideFrames=3`
  - `inferenceScale=0.7`

## 观察点
- HUD 状态中出现 `Assist` 标签（说明节奏已降档）。
- 诊断栏显示 `health/stride/scale`，与注入值一致。

## 截图
- `docs/evidence/2026-04-04-0435-web-health-adaptive-v31.png`
